export type PackageMedia = Readonly<{ uri: string; filename: string; byteSize: number }>;
export type PackageIntent = Readonly<{ id: string; json: string; media: readonly PackageMedia[] }>;
export type PreparedPackage = Readonly<{ id: string; uri: string; byteSize: number }>;
export interface PackagePort {
  prepare(intent: PackageIntent, cancelled: () => boolean): Promise<PreparedPackage>;
  cancel(): Promise<void>;
  discard(id: string): Promise<void>;
  available(packageFile: PreparedPackage): Promise<boolean>;
}
