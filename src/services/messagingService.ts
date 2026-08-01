import { IMessagingService, PushNotificationPayload } from '../domain/messagingService';
import { IGoogleAuthService } from './googleAuthService';
import { ISessionRepository } from '../domain/sessionRepository';

export class MessagingService implements IMessagingService {
  private googleAuthService: IGoogleAuthService;
  private sessionRepository: ISessionRepository;
  private projectId: string;

  constructor(
    googleAuthService: IGoogleAuthService,
    sessionRepository: ISessionRepository,
    projectId: string
  ) {
    this.googleAuthService = googleAuthService;
    this.sessionRepository = sessionRepository;
    this.projectId = projectId;
  }

  /**
   * Helper method to compile the FCM v1 REST API message payload.
   */
  private compileFcmPayload(deviceToken: string, payload: PushNotificationPayload): any {
    const dataBlock: Record<string, string> = {
      ...(payload.customData || {}),
    };

    if (payload.deepLinkUrl) {
      dataBlock.url = payload.deepLinkUrl;
    }

    const message: any = {
      token: deviceToken,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: dataBlock,
    };

    if (payload.imageUrl) {
      message.notification.image = payload.imageUrl;
    }

    // Populate webpush parameters to ensure browsers handle deep-linking clicks natively
    if (payload.deepLinkUrl) {
      message.webpush = {
        fcm_options: {
          link: payload.deepLinkUrl,
        },
      };
    }

    return { message };
  }

  /**
   * Sends a targeted FCM push notification to a specific Firebase UID.
   * Resolves the target's active FCM registration tokens from the SessionRepository and sends them.
   */
  public async sendNotificationToUser(
    uid: string,
    payload: PushNotificationPayload
  ): Promise<{ successCount: number; failures: string[] }> {
    // Fetch active device tokens from D1 repository
    const tokens = await this.sessionRepository.getFCMTokensByUid(uid);
    if (!tokens || tokens.length === 0) {
      return { successCount: 0, failures: [`No active FCM tokens found for UID: ${uid}`] };
    }

    return this.sendNotificationToTokens(tokens, payload);
  }

  /**
   * Sends push notifications to a list of tokens. If there is one token,
   * it sends to that single device, otherwise sends to all remote tokens in the list.
   */
  public async sendNotificationToTokens(
    tokens: string[],
    payload: PushNotificationPayload
  ): Promise<{ successCount: number; failures: string[] }> {
    if (!tokens || tokens.length === 0) {
      return { successCount: 0, failures: ['No tokens provided.'] };
    }

    let successCount = 0;
    const failures: string[] = [];

    // If there is exactly one token in the list, send to that single device
    if (tokens.length === 1) {
      try {
        await this.sendNotificationToToken(tokens[0], payload);
        successCount = 1;
      } catch (err: any) {
        failures.push(`Token ${tokens[0].substring(0, 10)}... failed: ${err.message}`);
      }
      return { successCount, failures };
    }

    // Else send notification to all those remote device tokens
    for (const token of tokens) {
      try {
        await this.sendNotificationToToken(token, payload);
        successCount++;
      } catch (err: any) {
        failures.push(`Token ${token.substring(0, 10)}... failed: ${err.message}`);
      }
    }

    return { successCount, failures };
  }

  /**
   * Dispatches push notifications to all users registered in the system (broadcast).
   */
  public async sendNotificationToAllUsers(
    payload: PushNotificationPayload
  ): Promise<{ successCount: number; failures: string[] }> {
    const allTokens = await this.sessionRepository.getAllFCMTokens();
    if (!allTokens || allTokens.length === 0) {
      return { successCount: 0, failures: ['No registered device sessions in the system.'] };
    }

    return this.sendNotificationToTokens(allTokens, payload);
  }

  /**
   * Directly sends an FCM push notification to a raw registration token using Google HTTP/v1 REST API.
   */
  public async sendNotificationToToken(deviceToken: string, payload: PushNotificationPayload): Promise<void> {
    const accessToken = await this.googleAuthService.getAccessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`;

    const fcmPayload = this.compileFcmPayload(deviceToken, payload);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fcmPayload),
      signal: AbortSignal.timeout(10000), // 10s safeguard timeout on edge
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`FCM API dispatch failed: ${errText}`);
    }
  }
}
