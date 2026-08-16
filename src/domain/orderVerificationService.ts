import { OrderVerificationResult } from './types';

export interface IOrderVerificationService {
  /**
   * Verifies an order payload (advanced JSON-LD format B2B/B2C) against
   * the blogger-hosted product and service schemas using Blogger API endpoints.
   */
  verifyOrder(orderPayload: any): Promise<OrderVerificationResult>;
}
