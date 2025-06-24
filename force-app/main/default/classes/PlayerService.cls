/**
 * @description Service class for managing Player__c records in the Settle Up application
 * @author Settle Up Team
 * @date 2025
 */
public without sharing class PlayerService {
    
    // Constants for player management
    private static final Integer PLAYER_CODE_LENGTH = 8;
    private static final String ACTIVE_STATUS = 'Active';
    private static final String INACTIVE_STATUS = 'Inactive';
    private static final String DEFAULT_CURRENCY = 'USD';
    
    /**
     * @description Creates a new player record with unique code
     * @param name Player's full name
     * @param email Player's email address (must be unique)
     * @param phone Player's phone number
     * @return Id The created player record Id
     * @throws DmlException if player creation fails
     */
    public static Id createPlayer(String name, String email, String phone) {
        return createPlayer(name, email, phone, DEFAULT_CURRENCY);
    }
    
    /**
     * @description Creates a new player record with unique code and specified currency
     * @param name Player's full name
     * @param email Player's email address (must be unique)
     * @param phone Player's phone number
     * @param defaultCurrency Player's preferred currency
     * @return Id The created player record Id
     * @throws DmlException if player creation fails
     */
    public static Id createPlayer(String name, String email, String phone, String defaultCurrency) {
        try {
            // Validate input parameters
            if (String.isBlank(name) || String.isBlank(email)) {
                throw new PlayerServiceException('Name and email are required fields');
            }
            
            // Check if player with this email already exists
            if (getPlayerByEmail(email) != null) {
                throw new PlayerServiceException('Player with this email already exists');
            }
            
            // Create new player record
            Player__c player = new Player__c(
                Name = name.trim(),
                Email__c = email.trim().toLowerCase(),
                Phone__c = String.isNotBlank(phone) ? phone.trim() : null,
                Player_Code__c = generateUniqueCode(),
                Status__c = ACTIVE_STATUS,
                Created_Date__c = Date.today(),
                Last_Activity__c = DateTime.now(),
                Total_Groups__c = 0,
                Default_Currency__c = String.isNotBlank(defaultCurrency) ? defaultCurrency : DEFAULT_CURRENCY
            );
            
            insert player;
            
            System.debug('Player created successfully: ' + player.Id);
            return player.Id;
            
        } catch (DmlException e) {
            System.debug(LoggingLevel.ERROR, 'DML Error creating player: ' + e.getMessage());
            throw new PlayerServiceException('Failed to create player: ' + e.getDmlMessage(0));
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Error creating player: ' + e.getMessage());
            throw new PlayerServiceException('Failed to create player: ' + e.getMessage());
        }
    }
    
    /**
     * @description Finds a player by email address
     * @param email Email address to search for
     * @return Player__c The player record or null if not found
     */
    public static Player__c getPlayerByEmail(String email) {
        if (String.isBlank(email)) {
            return null;
        }
        
        try {
            List<Player__c> players = [
                SELECT Id, Name, Email__c, Phone__c, Player_Code__c, Status__c, 
                       Created_Date__c, Last_Activity__c, Total_Groups__c, Default_Currency__c,
                       Avatar_URL__c, Preferences__c
                FROM Player__c 
                WHERE Email__c = :email.trim().toLowerCase() 
                AND Status__c = :ACTIVE_STATUS
                LIMIT 1
            ];
            
            return players.isEmpty() ? null : players[0];
            
        } catch (QueryException e) {
            System.debug(LoggingLevel.ERROR, 'Query error in getPlayerByEmail: ' + e.getMessage());
            return null;
        }
    }
    
    /**
     * @description Finds a player by unique player code
     * @param playerCode Unique player code to search for
     * @return Player__c The player record or null if not found
     */
    public static Player__c getPlayerByCode(String playerCode) {
        if (String.isBlank(playerCode)) {
            return null;
        }
        
        try {
            List<Player__c> players = [
                SELECT Id, Name, Email__c, Phone__c, Player_Code__c, Status__c, 
                       Created_Date__c, Last_Activity__c, Total_Groups__c, Default_Currency__c,
                       Avatar_URL__c, Preferences__c
                FROM Player__c 
                WHERE Player_Code__c = :playerCode.trim().toUpperCase() 
                AND Status__c = :ACTIVE_STATUS
                LIMIT 1
            ];
            
            return players.isEmpty() ? null : players[0];
            
        } catch (QueryException e) {
            System.debug(LoggingLevel.ERROR, 'Query error in getPlayerByCode: ' + e.getMessage());
            return null;
        }
    }
    
    /**
     * @description Gets a player by Id
     * @param playerId Player record Id
     * @return Player__c The player record or null if not found
     */
    public static Player__c getPlayerById(Id playerId) {
        if (playerId == null) {
            return null;
        }
        
        try {
            List<Player__c> players = [
                SELECT Id, Name, Email__c, Phone__c, Player_Code__c, Status__c, 
                       Created_Date__c, Last_Activity__c, Total_Groups__c, Default_Currency__c,
                       Avatar_URL__c, Preferences__c
                FROM Player__c 
                WHERE Id = :playerId 
                LIMIT 1
            ];
            
            return players.isEmpty() ? null : players[0];
            
        } catch (QueryException e) {
            System.debug(LoggingLevel.ERROR, 'Query error in getPlayerById: ' + e.getMessage());
            return null;
        }
    }
    
    /**
     * @description Generates a unique 8-character player code
     * @return String Unique player code
     */
    public static String generateUniqueCode() {
        String code;
        Integer attempts = 0;
        final Integer MAX_ATTEMPTS = 10;
        
        do {
            code = generateRandomCode();
            attempts++;
            
            if (attempts > MAX_ATTEMPTS) {
                throw new PlayerServiceException('Unable to generate unique player code after ' + MAX_ATTEMPTS + ' attempts');
            }
            
        } while (isCodeExists(code));
        
        return code;
    }
    
    /**
     * @description Updates the last activity timestamp for a player
     * @param playerId Id of the player to update
     */
    public static void updateLastActivity(Id playerId) {
        if (playerId == null) {
            return;
        }
        
        try {
            Player__c player = new Player__c(
                Id = playerId,
                Last_Activity__c = DateTime.now()
            );
            
            update player;
            
        } catch (DmlException e) {
            System.debug(LoggingLevel.ERROR, 'Error updating last activity: ' + e.getMessage());
            // Don't throw exception for activity updates as it's not critical
        }
    }
    
    /**
     * @description Deactivates a player account
     * @param playerId Id of the player to deactivate
     */
    public static void deactivatePlayer(Id playerId) {
        if (playerId == null) {
            return;
        }
        
        try {
            Player__c player = new Player__c(
                Id = playerId,
                Status__c = INACTIVE_STATUS
            );
            
            update player;
            
            System.debug('Player deactivated: ' + playerId);
            
        } catch (DmlException e) {
            System.debug(LoggingLevel.ERROR, 'Error deactivating player: ' + e.getMessage());
            throw new PlayerServiceException('Failed to deactivate player: ' + e.getDmlMessage(0));
        }
    }
    
    /**
     * @description Updates player profile information
     * @param playerId Player Id to update
     * @param name New name (optional)
     * @param phone New phone (optional)
     * @param avatarUrl New avatar URL (optional)
     * @param defaultCurrency New default currency (optional)
     */
    public static void updatePlayerProfile(Id playerId, String name, String phone, String avatarUrl, String defaultCurrency) {
        if (playerId == null) {
            throw new PlayerServiceException('Player Id is required');
        }
        
        try {
            Player__c player = new Player__c(Id = playerId);
            Boolean hasChanges = false;
            
            if (String.isNotBlank(name)) {
                player.Name = name.trim();
                hasChanges = true;
            }
            
            if (String.isNotBlank(phone)) {
                player.Phone__c = phone.trim();
                hasChanges = true;
            }
            
            if (String.isNotBlank(avatarUrl)) {
                player.Avatar_URL__c = avatarUrl.trim();
                hasChanges = true;
            }
            
            if (String.isNotBlank(defaultCurrency)) {
                player.Default_Currency__c = defaultCurrency;
                hasChanges = true;
            }
            
            if (hasChanges) {
                update player;
                System.debug('Player profile updated: ' + playerId);
            }
            
        } catch (DmlException e) {
            System.debug(LoggingLevel.ERROR, 'Error updating player profile: ' + e.getMessage());
            throw new PlayerServiceException('Failed to update player profile: ' + e.getDmlMessage(0));
        }
    }
    
    /**
     * @description Searches for players by name or email (for adding to groups)
     * @param searchTerm Search term to match against name or email
     * @param excludePlayerIds List of player Ids to exclude from results
     * @return List<Player__c> List of matching players
     */
    public static List<Player__c> searchPlayers(String searchTerm, List<Id> excludePlayerIds) {
        if (String.isBlank(searchTerm)) {
            return new List<Player__c>();
        }
        
        String searchPattern = '%' + searchTerm.trim() + '%';
        Set<Id> excludeIds = excludePlayerIds != null ? new Set<Id>(excludePlayerIds) : new Set<Id>();
        
        try {
            List<Player__c> players = [
                SELECT Id, Name, Email__c, Player_Code__c, Avatar_URL__c
                FROM Player__c 
                WHERE (Name LIKE :searchPattern OR Email__c LIKE :searchPattern)
                AND Status__c = :ACTIVE_STATUS
                AND Id NOT IN :excludeIds
                ORDER BY Name ASC
                LIMIT 50
            ];
            
            return players;
            
        } catch (QueryException e) {
            System.debug(LoggingLevel.ERROR, 'Error searching players: ' + e.getMessage());
            return new List<Player__c>();
        }
    }
    
    // Private helper methods
    
    /**
     * @description Generates a random 8-character code using alphanumeric characters
     * @return String Random code
     */
    private static String generateRandomCode() {
        String chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        String code = '';
        
        for (Integer i = 0; i < PLAYER_CODE_LENGTH; i++) {
            Integer randomIndex = Math.mod(Math.abs(Crypto.getRandomInteger()), chars.length());
            code += chars.substring(randomIndex, randomIndex + 1);
        }
        
        return code;
    }
    
    /**
     * @description Checks if a player code already exists
     * @param code Code to check
     * @return Boolean True if code exists, false otherwise
     */
    private static Boolean isCodeExists(String code) {
        try {
            Integer count = [
                SELECT COUNT() 
                FROM Player__c 
                WHERE Player_Code__c = :code
            ];
            
            return count > 0;
            
        } catch (QueryException e) {
            System.debug(LoggingLevel.ERROR, 'Error checking code existence: ' + e.getMessage());
            return true; // Assume exists to be safe
        }
    }
    
    /**
     * @description Custom exception class for PlayerService
     */
    public class PlayerServiceException extends Exception {}
}