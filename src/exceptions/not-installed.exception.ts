export class NotInstalledException extends Error {
  constructor(public application: string) {
    super('NotInstalled');
  }
}
