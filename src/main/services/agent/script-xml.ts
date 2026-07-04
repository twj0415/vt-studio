import type {
  ScriptAgentScriptDraft,
  ScriptAgentWorkspaceField,
  ScriptAgentWorkspaceSocketUpdate,
  ScriptAgentXmlApplyResult,
  ScriptAgentXmlAppliedPatch,
  ScriptAgentXmlPatchType,
} from '@shared/types/script-agent';
import {
  getScriptAgentWorkspace,
  updateScriptAgentWorkspaceField,
  upsertScriptAgentScript,
} from './script-workspace';
import { withTransaction } from '../database';

const XML_TAGS = ['storySkeleton', 'adaptationStrategy', 'scriptItem'] as const;
const XML_OPEN_PREFIXES = [
  '<storyskeleton',
  '</storyskeleton',
  '<adaptationstrategy',
  '</adaptationstrategy',
  '<scriptitem',
  '</scriptitem',
];

interface ParsedWorkspacePatch {
  type: Exclude<ScriptAgentXmlPatchType, 'scriptItem'>;
  content: string;
}

interface ParsedScriptPatch {
  type: 'scriptItem';
  script: ScriptAgentScriptDraft;
}

type ParsedPatch = ParsedWorkspacePatch | ParsedScriptPatch;

interface ParsedXml {
  patches: ParsedPatch[];
  errors: string[];
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function normalizeContent(value: string): string {
  return decodeXmlEntities(value).replace(/\r\n/g, '\n').trim();
}

function parseAttributes(value: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributePattern = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(value)) !== null) {
    attributes[match[1]!] = decodeXmlEntities(match[3] ?? match[4] ?? '');
  }

  return attributes;
}

function readOptionalScriptId(value: string | undefined, errors: string[]): number | null {
  if (!value) {
    return null;
  }

  const scriptId = Number(value);
  if (!Number.isInteger(scriptId) || scriptId <= 0) {
    errors.push('scriptItem id 无效');
    return null;
  }

  return scriptId;
}

function collectUnclosedTagErrors(content: string): string[] {
  const errors: string[] = [];
  const openPattern = /<(storySkeleton|adaptationStrategy|scriptItem)\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = openPattern.exec(content)) !== null) {
    const tagName = match[1]!;
    const closePattern = new RegExp(`</${tagName}>`, 'i');
    const tail = content.slice(openPattern.lastIndex);
    if (!closePattern.test(tail)) {
      errors.push(`${tagName} XML 标签未闭合`);
    }
  }

  return errors;
}

export function stripScriptAgentXmlForDisplay(content: string, stripPotentialOpenTail = false): string {
  let visible = content;
  for (const tagName of XML_TAGS) {
    visible = visible.replace(new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?</${tagName}>`, 'gi'), '');
    visible = visible.replace(new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*$`, 'gi'), '');
  }

  if (stripPotentialOpenTail) {
    const lastOpenIndex = visible.lastIndexOf('<');
    if (lastOpenIndex >= 0) {
      const tail = visible.slice(lastOpenIndex).toLowerCase();
      if (XML_OPEN_PREFIXES.some((prefix) => prefix.startsWith(tail) || tail.startsWith(prefix))) {
        visible = visible.slice(0, lastOpenIndex);
      }
    }
  }

  return visible.replace(/\n{3,}/g, '\n\n').trim();
}

export function parseScriptAgentXmlPatches(content: string): ParsedXml {
  const errors = collectUnclosedTagErrors(content);
  const patches: ParsedPatch[] = [];
  const workspacePattern = /<(storySkeleton|adaptationStrategy)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  const scriptPattern = /<scriptItem\b([^>]*)>([\s\S]*?)<\/scriptItem>/gi;
  let workspaceMatch: RegExpExecArray | null;
  let scriptMatch: RegExpExecArray | null;

  while ((workspaceMatch = workspacePattern.exec(content)) !== null) {
    const type = workspaceMatch[1] as Exclude<ScriptAgentXmlPatchType, 'scriptItem'>;
    const normalized = normalizeContent(workspaceMatch[2] ?? '');
    if (!normalized) {
      errors.push(`${type} XML 内容不能为空`);
      continue;
    }
    patches.push({ type, content: normalized });
  }

  while ((scriptMatch = scriptPattern.exec(content)) !== null) {
    const attributes = parseAttributes(scriptMatch[1] ?? '');
    const name = normalizeContent(attributes.name ?? '');
    const scriptContent = normalizeContent(scriptMatch[2] ?? '');
    if (!name) {
      errors.push('scriptItem name 不能为空');
      continue;
    }
    if (!scriptContent) {
      errors.push(`scriptItem「${name}」内容不能为空`);
      continue;
    }

    patches.push({
      type: 'scriptItem',
      script: {
        id: readOptionalScriptId(attributes.id, errors),
        episodeKey: attributes.episodeKey || attributes.episode_key || null,
        name,
        content: scriptContent,
      },
    });
  }

  return {
    patches,
    errors,
  };
}

function toWorkspaceField(type: Exclude<ScriptAgentXmlPatchType, 'scriptItem'>): ScriptAgentWorkspaceField {
  return type === 'storySkeleton' ? 'storySkeleton' : 'adaptationStrategy';
}

export function applyScriptAgentXmlOutput(projectId: number, content: string): ScriptAgentXmlApplyResult {
  const parsed = parseScriptAgentXmlPatches(content);
  if (parsed.errors.length > 0 || parsed.patches.length === 0) {
    return {
      appliedCount: 0,
      patches: [],
      errors: parsed.errors,
      workspace: null,
    };
  }

  return withTransaction(() => {
    const applied: ScriptAgentXmlAppliedPatch[] = [];
    for (const patch of parsed.patches) {
      if (patch.type === 'scriptItem') {
        const result = upsertScriptAgentScript({
          projectId,
          script: patch.script,
        });
        applied.push({
          type: 'scriptItem',
          scriptId: result.script.id,
          episodeKey: result.script.episodeKey,
          name: result.script.name,
        });
        continue;
      }

      updateScriptAgentWorkspaceField({
        projectId,
        field: toWorkspaceField(patch.type),
        content: patch.content,
      });
      applied.push({ type: patch.type });
    }

    return {
      appliedCount: applied.length,
      patches: applied,
      errors: [],
      workspace: getScriptAgentWorkspace({ projectId }).workspace,
    };
  });
}

export function createScriptAgentWorkspaceSocketUpdate(projectId: number, result: ScriptAgentXmlApplyResult): ScriptAgentWorkspaceSocketUpdate {
  return {
    projectId,
    source: 'xml',
    result,
  };
}
