export interface SharePort {
  // Completion means the OS share UI returned; it does not prove delivery.
  share(uri: string): Promise<void>;
}
