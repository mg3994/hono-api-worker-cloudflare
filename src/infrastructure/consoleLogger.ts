import { ILogger } from '../domain/logger';

export class ConsoleLogger implements ILogger {
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  public info(message: string, ...args: any[]): void {
    console.log(`[${this.getTimestamp()}] INFO: ${message}`, ...args);
  }

  public warn(message: string, ...args: any[]): void {
    console.warn(`[${this.getTimestamp()}] WARN: ${message}`, ...args);
  }

  public error(message: string, ...args: any[]): void {
    console.error(`[${this.getTimestamp()}] ERROR: ${message}`, ...args);
  }
}
