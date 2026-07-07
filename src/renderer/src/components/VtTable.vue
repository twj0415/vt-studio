<script setup lang="ts">
import { computed, useSlots } from 'vue';
import type { PaginationProps } from 'tdesign-vue-next/es/pagination';
import type { SelectOptions, TableCol, TableProps, TableRowData } from 'tdesign-vue-next/es/table';

export interface VtTablePagination {
  current: number;
  pageSize: number;
  total: number;
  pageSizeOptions?: PaginationProps['pageSizeOptions'];
}

const props = withDefaults(defineProps<{
  title?: string;
  columns: TableCol<TableRowData>[];
  data: TableRowData[];
  rowKey?: string;
  loading?: boolean;
  emptyText?: string;
  selectedRowKeys?: Array<string | number>;
  pagination?: VtTablePagination | null;
  minWidth?: number | string;
  height?: TableProps['height'];
  bordered?: boolean;
}>(), {
  title: '',
  rowKey: 'id',
  loading: false,
  emptyText: '',
  selectedRowKeys: () => [],
  pagination: null,
  minWidth: undefined,
  height: '100%',
  bordered: true,
});

const emit = defineEmits<{
  selectChange: [selectedRowKeys: Array<string | number>, options: SelectOptions<TableRowData>];
  pageChange: [page: number];
  pageSizeChange: [pageSize: number];
}>();

const slots = useSlots();
const defaultColumnAlign: NonNullable<TableCol<TableRowData>['align']> = 'center';

const hasToolbar = computed(() => Boolean(slots.toolbar));
const tableSlotNames = computed(() => Object.keys(slots).filter((name) => name !== 'toolbar'));
const tableStyle = computed(() => ({
  minWidth: typeof props.minWidth === 'number' ? `${props.minWidth}px` : props.minWidth,
}));

function resolveColumn(column: TableCol<TableRowData>): TableCol<TableRowData> {
  return {
    ...column,
    align: column.align ?? defaultColumnAlign,
    children: column.children?.map(resolveColumn),
  };
}

const resolvedColumns = computed(() => props.columns.map(resolveColumn));
</script>

<template>
  <section class="vt-table">
    <div v-if="title || hasToolbar" class="vt-table__head">
      <strong v-if="title">{{ title }}</strong>
      <div v-if="hasToolbar" class="vt-table__toolbar">
        <slot name="toolbar" />
      </div>
    </div>

    <div class="vt-table__body">
      <t-table
        table-layout="fixed"
        size="medium"
        hover
        :style="tableStyle"
        :height="height"
        :row-key="rowKey"
        :data="data"
        :columns="resolvedColumns"
        :loading="loading"
        :empty="emptyText"
        :bordered="bordered"
        :disable-data-page="true"
        :selected-row-keys="selectedRowKeys"
        @select-change="(keys: Array<string | number>, options: SelectOptions<TableRowData>) => emit('selectChange', keys, options)"
      >
        <template v-for="name in tableSlotNames" #[name]="slotProps" :key="name" >
          <slot :name="name" v-bind="slotProps" />
        </template>
      </t-table>
    </div>

    <div v-if="pagination" class="vt-table__pagination">
      <t-pagination
        size="small"
        :current="pagination.current"
        :page-size="pagination.pageSize"
        :total="pagination.total"
        :total-content="false"
        :page-size-options="pagination.pageSizeOptions"
        @current-change="(page: number) => emit('pageChange', page)"
        @page-size-change="(pageSize: number) => emit('pageSizeChange', pageSize)"
      />
    </div>
  </section>
</template>

<style scoped>
.vt-table {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.vt-table__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.vt-table__head strong {
  color: var(--vt-text-primary);
  font-size: 16px;
  line-height: 1.4;
}

.vt-table__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.vt-table__body {
  display: flex;
  align-items: stretch;
  justify-content: center;
  flex: 1;
  width: 100%;
  min-height: 240px;
  margin-top: 12px;
  overflow: auto;
}

.vt-table__body :deep(.t-table) {
  flex: 1 1 auto;
  width: 100%;
  min-height: 100%;
  border: 0;
  background: transparent;
}

.vt-table__body :deep(.t-table--full-height) {
  display: flex;
  flex-direction: column;
}

.vt-table__body :deep(.t-table__content) {
  flex: 1;
  min-height: 0;
  height: 100%;
  border: 0;
  background: color-mix(in srgb, var(--vt-surface-raised) 72%, transparent);
}

.vt-table__body :deep(.t-table__content > table) {
  margin: 0 auto;
}

.vt-table__body :deep(.t-table th),
.vt-table__body :deep(.t-table td) {
  padding: 12px 10px;
  border-bottom-color: color-mix(in srgb, var(--vt-line-soft) 62%, transparent);
  border-left: 0;
  border-right: 0;
  color: var(--vt-text-secondary);
  font-size: 13px;
}

.vt-table__body :deep(.t-table th) {
  color: var(--vt-text-muted);
  background: color-mix(in srgb, var(--vt-surface-panel) 48%, transparent);
  font-size: 12px;
  font-weight: 700;
}

.vt-table__body :deep(.t-table tbody tr:last-child td) {
  border-bottom-color: color-mix(in srgb, var(--vt-line-soft) 42%, transparent);
}

.vt-table__body :deep(.t-table tbody tr:hover) {
  background: color-mix(in srgb, var(--vt-brand) 6%, transparent);
}

.vt-table__body :deep(.t-table--bordered td),
.vt-table__body :deep(.t-table--bordered th) {
  border-left: 1px solid color-mix(in srgb, var(--vt-line-soft) 46%, transparent);
  border-color: color-mix(in srgb, var(--vt-line-soft) 46%, transparent);
}

.vt-table__body :deep(.t-table--bordered .t-table__content) {
  border: 1px solid color-mix(in srgb, var(--vt-line-soft) 46%, transparent);
  border-color: color-mix(in srgb, var(--vt-line-soft) 46%, transparent);
}

.vt-table__pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

@media (max-width: 960px) {
  .vt-table__toolbar {
    display: grid;
    width: 100%;
    justify-content: stretch;
  }
}
</style>
