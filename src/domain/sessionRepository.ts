export interface DeviceSessionRecord {
  browserClientId: string;
  uid: string;
  deviceToken: string;
  clientName: string;
  updatedAt: number;
}

export interface ISessionRepository {
  /**
   * Persists or updates the device session record (FCM token, browser ID, UID) inside D1.
   */
  syncDeviceSession(session: DeviceSessionRecord): Promise<void>;

  /**
   * Removes or marks as logged out the device session for a specific browserClientId.
   */
  logoutDevice(browserClientId: string): Promise<void>;

  /**
   * Fetches the device sessions associated with a specific user ID.
   */
  getSessionsByUid(uid: string): Promise<DeviceSessionRecord[]>;

  /**
   * Retrieves all active remote FCM device tokens associated with a given Firebase UID.
   */
  getFCMTokensByUid(uid: string): Promise<string[]>;

  /**
   * Retrieves all unique active FCM device tokens registered in the system.
   */
  getAllFCMTokens(): Promise<string[]>;
}
