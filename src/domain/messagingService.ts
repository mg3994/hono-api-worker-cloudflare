export interface PushNotificationPayload {
  title: string;
  body: string;
  imageUrl?: string;
  deepLinkUrl?: string; // target click navigation url
  customData?: Record<string, string>;
}

export interface IMessagingService {
  /**
   * Sends a targeted FCM push notification to a specific Firebase UID.
   * Resolves the target's active FCM registration tokens from the D1 SessionRepository
   * and dispatches them via Google's HTTP/v1 REST endpoints.
   */
  sendNotificationToUser(uid: string, payload: PushNotificationPayload): Promise<{ successCount: number; failures: string[] }>;

  /**
   * Directly sends an FCM push notification to a raw registration token.
   */
  sendNotificationToToken(deviceToken: string, payload: PushNotificationPayload): Promise<void>;

  /**
   * Sends push notifications to a list of tokens. If there is one token,
   * it sends to that single device, otherwise sends to all remote tokens in the list.
   */
  sendNotificationToTokens(tokens: string[], payload: PushNotificationPayload): Promise<{ successCount: number; failures: string[] }>;

  /**
   * Dispatches push notifications to all users registered in the system (broadcast).
   */
  sendNotificationToAllUsers(payload: PushNotificationPayload): Promise<{ successCount: number; failures: string[] }>;
}
