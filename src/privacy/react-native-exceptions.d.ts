declare module 'react-native/Libraries/Core/ExceptionsManager' {
  const manager: { handleException(error: unknown, isFatal: boolean): void };
  export default manager;
}
