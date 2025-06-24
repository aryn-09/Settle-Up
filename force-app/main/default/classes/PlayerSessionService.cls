/**
 * @description Service class for managing Player Sessions in the Settle Up application
 * Handles session creation, validation, and cleanup for player authentication simulation
 * @author Settle Up Team
 * @date 2025
 */
public without sharing class PlayerSessionService {
    
    // Constants for session management
    private static final Integer SESSION_TIMEOUT_HOURS = 24;
    private static final Integer SESSION_TOKEN_LENGTH = 32;
    private static final Integer MAX_ACTIVE_SESSIONS_PER_PLAYER = 5;
    private static final String ACTIVE_SESSION_STATUS = 'Active';
    private static final String EXPIRED_SESSION_STATUS = 'Expired';
    private static final String ENDED_SESSION_STATUS = 'Ended';
    
    /**
     * @description Creates a new session for a player
     * @param playerId Id of the player starting the session
     * @param deviceInfo Information about the device/browser
     * @return String Session token for the created session
     * @throws PlayerSessionException if session creation fails
     */
    public static String createSession(Id playerId, String deviceInfo) {
        return createSession(playerId, deviceInfo, null);
    }
    
    /**
     * @description Creates a new session for a player with IP address
     * @param playerId Id of the player starting the session
     * @param deviceInfo Information about the device/browser
     * @param ipAddress IP address of the client
     * @return String Session token for the created session
     * @throws PlayerSessionException if session creation fails
     */
    public static String createSession(Id playerId, String deviceInfo, String ipAddress) {
        if (playerId == null) {
            throw new PlayerSessionException('Player Id is required to create session');
        }
        
        try {
            // Clean up expired sessions for this player
            cleanupExpiredSessions(playerId);
            
            // Check if player has too many active sessions
            validateSessionLimit(playerId);
            
            // Generate unique session token
            String sessionToken = generateSessionToken();
            
            // Create new session record
            Player_Session__c session = new Player_Session__c(
                Player__c = playerId,
                Session_Token__c = sessionToken,
                Login_Time__c = DateTime.now(),
                Last_Activity__c = DateTime.now(),
                Is_Active__c = true,
                Device_Info__c = String.isNotBlank(deviceInfo) ? deviceInfo.abbreviate(255) : null,
                IP_Address__c = String.isNotBlank(ipAddress) ? ipAddress.abbreviate(50) : null
            );
            
            insert session;
            
            // Update player's last activity
            PlayerService.updateLastActivity(playerId);
            
            System.debug('Session created successfully for player: ' + playerId + ', Token: ' + sessionToken);
            return sessionToken;
            
        } catch (DmlException e) {
            System.debug(LoggingLevel.ERROR, 'DML Error creating session: ' + e.getMessage());
            throw new PlayerSessionException('Failed to create session: ' + e.getDmlMessage(0));
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Error creating session: ' + e.getMessage());
            throw new PlayerSessionException('Failed to create session: ' + e.getMessage());
        }
    }
    
    /**
     * @description Validates if a session token is valid and active
     * @param sessionToken Session token to validate
     * @return Boolean True if session is valid and active
     */
    public static Boolean validateSession(String sessionToken) {
        if (String.isBlank(sessionToken)) {
            return false;
        }
        
        try {
            List<Player_Session__c> sessions = [
                SELECT Id, Player__c, Last_Activity__c, Is_Active__c
                FROM Player_Session__c
                WHERE Session_Token__c = :sessionToken
                AND Is_Active__c = true
                LIMIT 1
            ];
            
            if (sessions.isEmpty()) {
                System.debug('Session not found or inactive: ' + sessionToken);
                return false;
            }
            
            Player_Session__c session = sessions[0];
            
            // Check if session has expired
            DateTime expiryTime = session.Last_Activity__c.addHours(SESSION_TIMEOUT_HOURS);
            if (DateTime.now() > expiryTime) {
                System.debug('Session expired: ' + sessionToken);
                expireSession(sessionToken);
                return false;
            }
            
            // Update session activity
            updateSessionActivity(sessionToken);
            
            return true;
            
        } catch (QueryException e) {
            System.debug(LoggingLevel.ERROR, 'Query error validating session: ' + e.getMessage());
            return false;
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Error validating session: ' + e.getMessage());
            return false;
        }
    }
    
    /**
     * @description Gets the player Id associated with a session token
     * @param sessionToken Session token to lookup
     * @return Id Player Id associated with the session, null if not found or invalid
     */
    public static Id getPlayerFromSession(String sessionToken) {
        if (String.isBlank(sessionToken)) {
            return null;
        }
        
        try {
            List<Player_Session__c> sessions = [
                SELECT Player__c, Last_Activity__c
                FROM Player_Session__c
                WHERE Session_Token__c = :sessionToken
                AND Is_Active__c = true
                LIMIT 1
            ];
            
            if (sessions.isEmpty()) {
                return null;
            }
            
            Player_Session__c session = sessions[0];
            
            // Check if session has expired
            DateTime expiryTime = session.Last_Activity__c.addHours(SESSION_TIMEOUT_HOURS);
            if (DateTime.now() > expiryTime) {
                expireSession(sessionToken);
                return null;
            }
            
            return session.Player__c;
            
        } catch (QueryException e) {
            System.debug(LoggingLevel.ERROR, 'Query error getting player from session: ' + e.getMessage());
            return null;
        }
    }
    
    /**
     * @description Updates the last activity timestamp for a session
     * @param sessionToken Session token to update
     */
    public static void updateSessionActivity(String sessionToken) {
        if (String.isBlank(sessionToken)) {
            return;
        }
        
        try {
            List<Player_Session__c> sessions = [
                SELECT Id, Player__c
                FROM Player_Session__c
                WHERE Session_Token__c = :sessionToken
                AND Is_Active__c = true
                LIMIT 1
            ];
            
            if (!sessions.isEmpty()) {
                Player_Session__c session = sessions[0];
                session.Last_Activity__c = DateTime.now();
                update session;
                
                // Also update player's last activity
                PlayerService.updateLastActivity(session.Player__c);
            }
            
        } catch (DmlException e) {
            System.debug(LoggingLevel.ERROR, 'Error updating session activity: ' + e.getMessage());
            // Don't throw exception for activity updates as it's not critical
        }
    }
    
    /**
     * @description Ends a player session (logout)
     * @param sessionToken Session token to end
     */
    public static void endSession(String sessionToken) {
        if (String.isBlank(sessionToken)) {
            return;
        }
        
        try {
            List<Player_Session__c> sessions = [
                SELECT Id
                FROM Player_Session__c
                WHERE Session_Token__c = :sessionToken
                AND Is_Active__c = true
                LIMIT 1
            ];
            
            if (!sessions.isEmpty()) {
                Player_Session__c session = sessions[0];
                session.Is_Active__c = false;
                update session;
                
                System.debug('Session ended: ' + sessionToken);
            }
            
        } catch (DmlException e) {
            System.debug(LoggingLevel.ERROR, 'Error ending session: ' + e.getMessage());
            throw new PlayerSessionException('Failed to end session: ' + e.getDmlMessage(0));
        }
    }
    
    /**
     * @description Ends all active sessions for a player (useful for security)
     * @param playerId Player Id whose sessions should be ended
     */
    public static void endAllPlayerSessions(Id playerId) {
        if (playerId == null) {
            return;
        }
        
        try {
            List<Player_Session__c> sessions = [
                SELECT Id
                FROM Player_Session__c
                WHERE Player__c = :playerId
                AND Is_Active__c = true
            ];
            
            if (!sessions.isEmpty()) {
                for (Player_Session__c session : sessions) {
                    session.Is_Active__c = false;
                }
                update sessions;
                
                System.debug('All sessions ended for player: ' + playerId + ', Count: ' + sessions.size());
            }
            
        } catch (DmlException e) {
            System.debug(LoggingLevel.ERROR, 'Error ending all player sessions: ' + e.getMessage());
            throw new PlayerSessionException('Failed to end player sessions: ' + e.getDmlMessage(0));
        }
    }
    
    /**
     * @description Gets active session information for a player
     * @param playerId Player Id to get sessions for
     * @return List<Player_Session__c> List of active sessions
     */
    public static List<Player_Session__c> getPlayerActiveSessions(Id playerId) {
        if (playerId == null) {
            return new List<Player_Session__c>();
        }
        
        try {
            DateTime cutoffTime = DateTime.now().addHours(-SESSION_TIMEOUT_HOURS);
            
            List<Player_Session__c> sessions = [
                SELECT Id, Session_Token__c, Login_Time__c, Last_Activity__c, 
                       Device_Info__c, IP_Address__c
                FROM Player_Session__c
                WHERE Player__c = :playerId
                AND Is_Active__c = true
                AND Last_Activity__c > :cutoffTime
                ORDER BY Last_Activity__c DESC
            ];
            
            return sessions;
            
        } catch (QueryException e) {
            System.debug(LoggingLevel.ERROR, 'Error getting player sessions: ' + e.getMessage());
            return new List<Player_Session__c>();
        }
    }
    
    /**
     * @description Gets session information by token (for debugging/admin purposes)
     * @param sessionToken Session token to lookup
     * @return Player_Session__c Session record or null if not found
     */
    public static Player_Session__c getSessionInfo(String sessionToken) {
        if (String.isBlank(sessionToken)) {
            return null;
        }
        
        try {
            List<Player_Session__c> sessions = [
                SELECT Id, Player__c, Session_Token__c, Login_Time__c, Last_Activity__c,
                       Is_Active__c, Device_Info__c, IP_Address__c
                FROM Player_Session__c
                WHERE Session_Token__c = :sessionToken
                LIMIT 1
            ];
            
            return sessions.isEmpty() ? null : sessions[0];
            
        } catch (QueryException e) {
            System.debug(LoggingLevel.ERROR, 'Error getting session info: ' + e.getMessage());
            return null;
        }
    }
    
    /**
     * @description Cleans up expired sessions (can be called by scheduled job)
     */
    public static void cleanupExpiredSessions() {
        try {
            DateTime cutoffTime = DateTime.now().addHours(-SESSION_TIMEOUT_HOURS * 2); // Keep extra buffer
            
            List<Player_Session__c> expiredSessions = [
                SELECT Id
                FROM Player_Session__c
                WHERE Last_Activity__c < :cutoffTime
                AND Is_Active__c = true
                LIMIT 1000 // Process in batches
            ];
            
            if (!expiredSessions.isEmpty()) {
                for (Player_Session__c session : expiredSessions) {
                    session.Is_Active__c = false;
                }
                update expiredSessions;
                
                System.debug('Cleaned up expired sessions: ' + expiredSessions.size());
            }
            
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Error during session cleanup: ' + e.getMessage());
        }
    }
    
    // Private helper methods
    
    /**
     * @description Generates a unique session token
     * @return String Unique session token
     */
    private static String generateSessionToken() {
        String token;
        Integer attempts = 0;
        final Integer MAX_ATTEMPTS = 5;
        
        do {
            token = generateRandomToken();
            attempts++;
            
            if (attempts > MAX_ATTEMPTS) {
                throw new PlayerSessionException('Unable to generate unique session token after ' + MAX_ATTEMPTS + ' attempts');
            }
            
        } while (isTokenExists(token));
        
        return token;
    }
    
    /**
     * @description Generates a random token using crypto functions
     * @return String Random token
     */
    private static String generateRandomToken() {
        Blob randomBlob = Crypto.generateAesKey(256);
        String token = EncodingUtil.base64Encode(randomBlob);
        
        // Clean up the token - remove special characters and truncate
        token = token.replaceAll('[^a-zA-Z0-9]', '');
        
        if (token.length() > SESSION_TOKEN_LENGTH) {
            token = token.substring(0, SESSION_TOKEN_LENGTH);
        }
        
        return token;
    }
    
    /**
     * @description Checks if a session token already exists
     * @param token Token to check
     * @return Boolean True if token exists, false otherwise
     */
    private static Boolean isTokenExists(String token) {
        try {
            Integer count = [
                SELECT COUNT()
                FROM Player_Session__c
                WHERE Session_Token__c = :token
            ];
            
            return count > 0;
            
        } catch (QueryException e) {
            System.debug(LoggingLevel.ERROR, 'Error checking token existence: ' + e.getMessage());
            return true; // Assume exists to be safe
        }
    }
    
    /**
     * @description Validates that a player doesn't have too many active sessions
     * @param playerId Player Id to check
     * @throws PlayerSessionException if too many sessions
     */
    private static void validateSessionLimit(Id playerId) {
        try {
            DateTime cutoffTime = DateTime.now().addHours(-SESSION_TIMEOUT_HOURS);
            
            Integer activeSessionCount = [
                SELECT COUNT()
                FROM Player_Session__c
                WHERE Player__c = :playerId
                AND Is_Active__c = true
                AND Last_Activity__c > :cutoffTime
            ];
            
            if (activeSessionCount >= MAX_ACTIVE_SESSIONS_PER_PLAYER) {
                // Clean up oldest sessions
                cleanupOldestSessions(playerId, 2); // Remove 2 oldest sessions
            }
            
        } catch (QueryException e) {
            System.debug(LoggingLevel.ERROR, 'Error validating session limit: ' + e.getMessage());
        }
    }
    
    /**
     * @description Cleans up expired sessions for a specific player
     * @param playerId Player Id to clean sessions for
     */
    private static void cleanupExpiredSessions(Id playerId) {
        try {
            DateTime cutoffTime = DateTime.now().addHours(-SESSION_TIMEOUT_HOURS);
            
            List<Player_Session__c> expiredSessions = [
                SELECT Id
                FROM Player_Session__c
                WHERE Player__c = :playerId
                AND Is_Active__c = true
                AND Last_Activity__c < :cutoffTime
            ];
            
            if (!expiredSessions.isEmpty()) {
                for (Player_Session__c session : expiredSessions) {
                    session.Is_Active__c = false;
                }
                update expiredSessions;
            }
            
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Error cleaning expired sessions: ' + e.getMessage());
        }
    }
    
    /**
     * @description Cleans up oldest sessions for a player
     * @param playerId Player Id
     * @param numberOfSessions Number of oldest sessions to remove
     */
    private static void cleanupOldestSessions(Id playerId, Integer numberOfSessions) {
        try {
            List<Player_Session__c> oldestSessions = [
                SELECT Id
                FROM Player_Session__c
                WHERE Player__c = :playerId
                AND Is_Active__c = true
                ORDER BY Last_Activity__c ASC
                LIMIT :numberOfSessions
            ];
            
            if (!oldestSessions.isEmpty()) {
                for (Player_Session__c session : oldestSessions) {
                    session.Is_Active__c = false;
                }
                update oldestSessions;
            }
            
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Error cleaning oldest sessions: ' + e.getMessage());
        }
    }
    
    /**
     * @description Expires a specific session
     * @param sessionToken Session token to expire
     */
    private static void expireSession(String sessionToken) {
        try {
            List<Player_Session__c> sessions = [
                SELECT Id
                FROM Player_Session__c
                WHERE Session_Token__c = :sessionToken
                LIMIT 1
            ];
            
            if (!sessions.isEmpty()) {
                Player_Session__c session = sessions[0];
                session.Is_Active__c = false;
                update session;
            }
            
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Error expiring session: ' + e.getMessage());
        }
    }
    
    /**
     * @description Custom exception class for PlayerSessionService
     */
    public class PlayerSessionException extends Exception {}
}