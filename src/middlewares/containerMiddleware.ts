import { MiddlewareHandler } from 'hono';
import { createContainer, AppContainer } from '../infrastructure/container';

declare module 'hono' {
  interface ContextVariableMap {
    container: AppContainer;
  }
}

/**
 * Middleware that instantiates and injects the Clean Architecture AppContainer into the Hono request context.
 * Decouples Hono router files from parsing environment variables or instantiating services directly.
 */
export const containerMiddleware = (): MiddlewareHandler<{ Bindings: CloudflareBindings }> => {
  return async (c, next) => {
    const container = createContainer(c.env);
    c.set('container', container);
    await next();
  };
};
