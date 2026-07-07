const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const DOCX_DOCUMENT_ENTRY = 'word/document.xml';

function createDocxParseError(message: string): Error {
  return new Error(message);
}

function findZipEndOfCentralDirectory(view: DataView, errorMessage: string): number {
  const minOffset = Math.max(0, view.byteLength - 65557);
  for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === ZIP_END_OF_CENTRAL_DIRECTORY) {
      return offset;
    }
  }

  throw createDocxParseError(errorMessage);
}

async function inflateRaw(data: Uint8Array, errorMessage: string): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw createDocxParseError(errorMessage);
  }

  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function extractZipEntry(buffer: ArrayBuffer, entryName: string, errorMessage: string): Promise<string> {
  const view = new DataView(buffer);
  const decoder = new TextDecoder('utf-8');
  const eocdOffset = findZipEndOfCentralDirectory(view, errorMessage);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  let offset = view.getUint32(eocdOffset + 16, true);

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== ZIP_CENTRAL_DIRECTORY_HEADER) {
      throw createDocxParseError(errorMessage);
    }

    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const fileNameBytes = new Uint8Array(buffer, offset + 46, fileNameLength);
    const fileName = decoder.decode(fileNameBytes);

    if (fileName === entryName) {
      if (view.getUint32(localHeaderOffset, true) !== ZIP_LOCAL_FILE_HEADER) {
        throw createDocxParseError(errorMessage);
      }

      const localNameLength = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = new Uint8Array(buffer, dataStart, compressedSize);
      const content = method === 0 ? compressed : method === 8 ? await inflateRaw(compressed, errorMessage) : null;
      if (!content) {
        throw createDocxParseError(errorMessage);
      }

      return decoder.decode(content);
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  throw createDocxParseError(errorMessage);
}

function docxXmlToText(xml: string): string {
  const documentXml = new DOMParser().parseFromString(xml, 'application/xml');
  const paragraphs = Array.from(documentXml.getElementsByTagName('w:p'));
  const lines = paragraphs
    .map((paragraph) => Array.from(paragraph.getElementsByTagName('w:t')).map((node) => node.textContent ?? '').join(''))
    .filter((line) => line.trim());

  return lines.join('\n');
}

export async function readDocxText(file: File, errorMessage: string): Promise<string> {
  const xml = await extractZipEntry(await file.arrayBuffer(), DOCX_DOCUMENT_ENTRY, errorMessage);
  const text = docxXmlToText(xml);
  if (!text.trim()) {
    throw createDocxParseError(errorMessage);
  }

  return text;
}
