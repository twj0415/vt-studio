import { parseJsonObject, type VendorRow } from './storage';

export const CONNECTION_PROJECTION_ID_PREFIX = 'conn_';
export const CONNECTION_PROJECTION_ADAPTER_KEY = '__adapterVendorId';
export const CONNECTION_PROJECTION_NAME_KEY = '__connectionName';

export interface ConnectionProjectionMeta {
  adapterVendorId: string;
  connectionName: string | null;
}

export function isConnectionProjectionId(vendorId: string): boolean {
  return vendorId.startsWith(CONNECTION_PROJECTION_ID_PREFIX);
}

export function getConnectionProjectionMeta(row: Pick<VendorRow, 'id' | 'input_values'>): ConnectionProjectionMeta | null {
  if (!isConnectionProjectionId(row.id)) {
    return null;
  }

  const inputValues = parseJsonObject(row.input_values);
  const adapterVendorId = inputValues[CONNECTION_PROJECTION_ADAPTER_KEY]?.trim();
  if (!adapterVendorId) {
    return null;
  }

  return {
    adapterVendorId,
    connectionName: inputValues[CONNECTION_PROJECTION_NAME_KEY]?.trim() || null,
  };
}

export function isConnectionProjectionRow(row: Pick<VendorRow, 'id' | 'input_values'>): boolean {
  return Boolean(getConnectionProjectionMeta(row));
}
