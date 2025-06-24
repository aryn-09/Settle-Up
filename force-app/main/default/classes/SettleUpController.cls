public without sharing class SettleUpController {
    
    /**
     * Login method for players
     * @param email Player's email address
     * @param password Player's password
     * @param deviceInfo Device information for session tracking
     * @return JSON string with login result
     */
    @AuraEnabled
    public static String loginPlayer(String email, String password, String deviceInfo) {
        try {
            // Validate input parameters
            if (String.isBlank(email)) {
                return createErrorResponse('Email is required');
            }
            if (String.isBlank(password)) {
                return createErrorResponse('Password is required');
            }
            // Find player by email
            List<Player__c> players = [
                SELECT Id, Name, Email__c, Status__c, Last_Activity__c, Player_Code__c, Default_Currency__c, Password__c
                FROM Player__c 
                WHERE Email__c = :email.toLowerCase().trim() 
                AND Status__c = 'Active'
                LIMIT 1
            ];
            if (players.isEmpty()) {
                return createErrorResponse('Player not found or inactive');
            }
            Player__c player = players[0];
            // Validate password
            if (player.Password__c != password) {
                return createErrorResponse('Incorrect password');
            }
            // Update player's last activity
            player.Last_Activity__c = DateTime.now();
            update player;
            // Create session
            String sessionToken = PlayerSessionService.createSession(player.Id, deviceInfo);
            if (String.isBlank(sessionToken)) {
                return createErrorResponse('Failed to create session');
            }
            // Return success response
            Map<String, Object> response = new Map<String, Object>{
                'success' => true,
                'sessionToken' => sessionToken,
                'playerId' => player.Id,
                'playerName' => player.Name,
                'playerCode' => player.Player_Code__c,
                'defaultCurrency' => player.Default_Currency__c,
                'message' => 'Login successful'
            };
            return JSON.serialize(response);
        } catch (Exception e) {
            System.debug('Login error: ' + e.getMessage());
            return createErrorResponse('Login failed: ' + e.getMessage());
        }
    }
    
    /**
     * Register new player
     * @param name Player's full name
     * @param email Player's email address
     * @param phone Player's phone number
     * @param password Player's password
     * @param securityQuestion Security question
     * @param securityAnswer Security answer
     * @return JSON string with registration result
     */
    @AuraEnabled
    public static String registerPlayer(String name, String email, String phone, String password, String securityQuestion, String securityAnswer) {
        try {
            // Validate input parameters
            if (String.isBlank(name)) {
                return createErrorResponse('Name is required');
            }
            if (String.isBlank(email)) {
                return createErrorResponse('Email is required');
            }
            if (String.isBlank(phone)) {
                return createErrorResponse('Phone number is required');
            }
            if (String.isBlank(password)) {
                return createErrorResponse('Password is required');
            }
            if (String.isBlank(securityQuestion)) {
                return createErrorResponse('Security question is required');
            }
            if (String.isBlank(securityAnswer)) {
                return createErrorResponse('Security answer is required');
            }
            // Validate email format
            if (!isValidEmail(email)) {
                return createErrorResponse('Please enter a valid email address');
            }
            String cleanEmail = email.toLowerCase().trim();
            // Check if email already exists
            List<Player__c> existingPlayers = [
                SELECT Id, Email__c, Status__c 
                FROM Player__c 
                WHERE Email__c = :cleanEmail
                LIMIT 1
            ];
            if (!existingPlayers.isEmpty()) {
                if (existingPlayers[0].Status__c == 'Active') {
                    return createErrorResponse('Email already registered');
                } else {
                    // Reactivate inactive player
                    Player__c existingPlayer = existingPlayers[0];
                    existingPlayer.Name = name.trim();
                    existingPlayer.Phone__c = phone.trim();
                    existingPlayer.Password__c = password;
                    existingPlayer.Security_Question__c = securityQuestion.trim();
                    existingPlayer.Security_Answer__c = securityAnswer;
                    existingPlayer.Status__c = 'Active';
                    existingPlayer.Last_Activity__c = DateTime.now();
                    update existingPlayer;
                    Map<String, Object> response = new Map<String, Object>{
                        'success' => true,
                        'playerId' => existingPlayer.Id,
                        'message' => 'Account reactivated successfully'
                    };
                    return JSON.serialize(response);
                }
            }
            // Create new player
            Player__c newPlayer = new Player__c(
                Name = name.trim(),
                Email__c = cleanEmail,
                Phone__c = phone.trim(),
                Password__c = password,
                Security_Question__c = securityQuestion.trim(),
                Security_Answer__c = securityAnswer,
                Status__c = 'Active',
                Player_Code__c = generateUniquePlayerCode(),
                Default_Currency__c = 'USD',
                Created_Date__c = Date.today(),
                Last_Activity__c = DateTime.now()
            );
            insert newPlayer;
            Map<String, Object> response = new Map<String, Object>{
                'success' => true,
                'playerId' => newPlayer.Id,
                'playerCode' => newPlayer.Player_Code__c,
                'message' => 'Registration successful'
            };
            return JSON.serialize(response);
        } catch (DmlException e) {
            System.debug('Registration DML error: ' + e.getMessage());
            return createErrorResponse('Registration failed: ' + e.getDmlMessage(0));
        } catch (Exception e) {
            System.debug('Registration error: ' + e.getMessage());
            return createErrorResponse('Registration failed: ' + e.getMessage());
        }
    }
    
    /**
     * Get player groups
     * @param sessionToken Session token for authentication
     * @return List of groups for the player
     */
    @AuraEnabled(cacheable=true)
    public static List<GroupWrapper> getPlayerGroups(String sessionToken) {
        System.debug('getPlayerGroups called with sessionToken: ' + sessionToken);
        try {
            // Validate session and get player ID
            Id playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
            System.debug('Player ID from session: ' + playerId);
            if (playerId == null) {
                System.debug('Invalid session detected in getPlayerGroups');
                throw new AuraHandledException('Invalid session');
            }
            
            // Update session activity
            System.debug('Updating session activity for sessionToken: ' + sessionToken);
            //PlayerSessionService.updateSessionActivity(sessionToken);
            
            // Get player's groups
            System.debug('Querying Group_Member__c for playerId: ' + playerId);
            List<Group_Member__c> memberships = [
                SELECT Id, Group__c, Group__r.Id, Group__r.Name, Group__r.Description__c, 
                       Group__r.Currency__c, Group__r.Total_Expenses__c, Group__r.Member_Count__c,
                       Group__r.Created_Date__c, Group__r.Last_Activity__c, Group__r.Group_Code__c,
                       Role__c, Status__c
                FROM Group_Member__c 
                WHERE Player__c = :playerId 
                AND Status__c = 'Active'
                AND Group__r.Status__c = 'Active'
                ORDER BY Group__r.Last_Activity__c DESC
            ];
            System.debug('Memberships found: ' + memberships.size());
            
            List<GroupWrapper> groupWrappers = new List<GroupWrapper>();
            
            for (Group_Member__c membership : memberships) {
                System.debug('Processing membership: ' + membership);
                
                // Calculate outstanding balance for this member
                Decimal outstandingBalance = ExpenseCalculationService.calculateOutstandingBalance(membership);
                
                GroupWrapper wrapper = new GroupWrapper();
                wrapper.groupId = membership.Group__r.Id;
                wrapper.groupName = membership.Group__r.Name;
                wrapper.description = membership.Group__r.Description__c;
                wrapper.currencs = membership.Group__r.Currency__c;
                wrapper.totalExpenses = membership.Group__r.Total_Expenses__c;
                wrapper.memberCount = Integer.valueOf(membership.Group__r.Member_Count__c);
                wrapper.groupCode = membership.Group__r.Group_Code__c;
                wrapper.playerRole = membership.Role__c;
                wrapper.netBalance = outstandingBalance; // Use outstanding balance instead of stored Net_Balance__c
                wrapper.lastActivity = membership.Group__r.Last_Activity__c;
                wrapper.createdDate = membership.Group__r.Created_Date__c;
                
                groupWrappers.add(wrapper);
            }
            System.debug('Returning groupWrappers: ' + groupWrappers);
            return groupWrappers;
            
        } catch (Exception e) {
            System.debug('Get groups error: ' + e.getMessage() + ' | StackTrace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to get groups: ' + e.getMessage());
        }
    }
    
    /**
     * Create new group
     * @param sessionToken Session token for authentication
     * @param groupName Name of the group
     * @param description Group description
     * @param currency Group currency
     * @return Group ID
     */
    @AuraEnabled
    public static String createGroup(String sessionToken, String groupName, String description, String currencs) {
        try {
            
            System.debug('Data received from Client currency:' + currencs);

            // Validate session and get player ID
            Id playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
            if (playerId == null) {
                throw new AuraHandledException('Invalid session');
            }
            
            // Validate input
            if (String.isBlank(groupName)) {
                throw new AuraHandledException('Group name is required');
            }
            
            // Create group
            Id groupId = GroupService.createGroup(groupName.trim(), description, playerId, currencs);
            
            return String.valueOf(groupId);
            
        } catch (Exception e) {
            System.debug('Create group error: ' + e.getMessage());
            throw new AuraHandledException('Failed to create group: ' + e.getMessage());
        }
    }
    
    /**
     * Join group using group code
     * @param sessionToken Session token for authentication
     * @param groupCode Unique group code
     * @return Success message
     */
    @AuraEnabled
    public static String joinGroup(String sessionToken, String groupCode) {
        try {
            // Validate session and get player ID
            Id playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
            if (playerId == null) {
                throw new AuraHandledException('Invalid session');
            }
            
            if (String.isBlank(groupCode)) {
                throw new AuraHandledException('Group code is required');
            }
            
            // Find group by code
            Group__c groups = GroupService.getGroupByCode(groupCode.trim().toUpperCase());
            if (groups == null) {
                throw new AuraHandledException('Group not found');
            }
            
            // Check if player is already a member
            List<Group_Member__c> existingMembership = [
                SELECT Id, Status__c 
                FROM Group_Member__c 
                WHERE Group__c = :groups.Id 
                AND Player__c = :playerId
                LIMIT 1
            ];
            
            if (!existingMembership.isEmpty()) {
                if (existingMembership[0].Status__c == 'Active') {
                    throw new AuraHandledException('You are already a member of this group');
                } else {
                    // Reactivate membership
                    existingMembership[0].Status__c = 'Active';
                    update existingMembership[0];
                    return 'Rejoined group successfully';
                }
            }
            
            // Add player to group
            GroupService.addMemberToGroup(groups.Id, playerId, 'Member');
            
            return 'Joined group successfully';
            
        } catch (Exception e) {
            System.debug('Join group error: ' + e.getMessage());
            throw new AuraHandledException('Failed to join group: ' + e.getMessage());
        }
    }
    
    /**
     * Validate session token
     * @param sessionToken Session token to validate
     * @return Player information if valid
     */
    @AuraEnabled(cacheable=true)
    public static String validateSession(String sessionToken) {
        try {
            Id playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
            if (playerId == null) {
                return createErrorResponse('Invalid session');
            }
            
            // Get player information
            Player__c player = [
                SELECT Id, Name, Email__c, Player_Code__c, Default_Currency__c
                FROM Player__c 
                WHERE Id = :playerId
                LIMIT 1
            ];
            
            Map<String, Object> response = new Map<String, Object>{
                'success' => true,
                'playerId' => player.Id,
                'playerName' => player.Name,
                'playerEmail' => player.Email__c,
                'playerCode' => player.Player_Code__c,
                'defaultCurrency' => player.Default_Currency__c
            };
            
            return JSON.serialize(response);
            
        } catch (Exception e) {
            System.debug('Validate session error: ' + e.getMessage());
            return createErrorResponse('Session validation failed');
        }
    }
    
    /**
     * Logout player
     * @param sessionToken Session token to end
     * @return Success message
     */
    @AuraEnabled
    public static String logoutPlayer(String sessionToken) {
        try {
            PlayerSessionService.endSession(sessionToken);
            return 'Logged out successfully';
            
        } catch (Exception e) {
            System.debug('Logout error: ' + e.getMessage());
            throw new AuraHandledException('Logout failed: ' + e.getMessage());
        }
    }
    
    // Helper Methods
    
    /**
     * Create error response JSON
     */
    private static String createErrorResponse(String message) {
        Map<String, Object> response = new Map<String, Object>{
            'success' => false,
            'message' => message
        };
        return JSON.serialize(response);
    }
    
    /**
     * Validate email format
     */
    private static Boolean isValidEmail(String email) {
        String emailRegex = '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$';
        Pattern emailPattern = Pattern.compile(emailRegex);
        return emailPattern.matcher(email).matches();
    }
    
    /**
     * Generate unique player code
     */
    private static String generateUniquePlayerCode() {
        String characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        String playerCode;
        Boolean isUnique = false;
        Integer attempts = 0;
        
        do {
            playerCode = '';
            for (Integer i = 0; i < 8; i++) {
                Integer randomIndex = Math.mod(Math.abs(Crypto.getRandomInteger()), characters.length());
                playerCode += characters.substring(randomIndex, randomIndex + 1);
            }
            
            // Check if code is unique
            List<Player__c> existingPlayers = [
                SELECT Id 
                FROM Player__c 
                WHERE Player_Code__c = :playerCode
                LIMIT 1
            ];
            
            isUnique = existingPlayers.isEmpty();
            attempts++;
            
        } while (!isUnique && attempts < 10);
        
        if (!isUnique) {
            // Fallback to timestamp-based code
            playerCode = 'PL' + String.valueOf(DateTime.now().getTime()).right(6);
        }
        
        return playerCode;
    }

    // Additional methods to add to SettleUpController.cls

@AuraEnabled
public static String getMemberBalances(String sessionToken, String groupId) {
    try {
        // Validate session
        Id playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
        if (playerId == null) {
            throw new AuraHandledException('Invalid session');
        }
        
        // Get all group members
        List<Group_Member__c> members = [
            SELECT Id, Player__c, Player__r.Name, Player__r.Avatar_URL__c, 
                   Nickname__c, Total_Paid__c, Total_Owed__c, Net_Balance__c,
                   Role__c, Status__c
            FROM Group_Member__c 
            WHERE Group__c = :groupId 
            AND Status__c = 'Active'
            ORDER BY Player__r.Name
        ];
        
        List<Map<String, Object>> memberData = new List<Map<String, Object>>();
        
        for (Group_Member__c member : members) {
            // Calculate outstanding balance (what's still owed after settlements)
            Decimal outstandingBalance = ExpenseCalculationService.calculateOutstandingBalance(member);
            
            Map<String, Object> memberInfo = new Map<String, Object>();
            memberInfo.put('id', member.Id);
            memberInfo.put('playerId', member.Player__c);
            memberInfo.put('name', member.Player__r.Name);
            memberInfo.put('nickname', member.Nickname__c);
            memberInfo.put('avatarUrl', member.Player__r.Avatar_URL__c);
            memberInfo.put('role', member.Role__c);
            memberInfo.put('totalPaid', member.Total_Paid__c != null ? member.Total_Paid__c : 0);
            memberInfo.put('totalOwed', member.Total_Owed__c != null ? member.Total_Owed__c : 0);
            memberInfo.put('netBalance', outstandingBalance); // Use outstanding balance instead of stored Net_Balance__c
            memberInfo.put('isOwed', outstandingBalance > 0.01);
            memberInfo.put('owes', outstandingBalance < -0.01);
            memberInfo.put('isSettled', Math.abs(outstandingBalance) <= 0.01);
            memberData.add(memberInfo);
        }
        
        return JSON.serialize(memberData);
        
    } catch (Exception e) {
        throw new AuraHandledException('Error retrieving member balances: ' + e.getMessage());
    }
}

@AuraEnabled
public static String getOptimalSettlements(String sessionToken, String groupId) {
    try {
        // Validate session
        Id playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
        if (playerId == null) {
            throw new AuraHandledException('Invalid session');
        }
        
        // Get detailed settlement analysis
        Map<String, Object> analysis = ExpenseCalculationService.getSettlementAnalysis(groupId);
        List<Map<String, Object>> optimalSettlements = (List<Map<String, Object>>) analysis.get('optimalSettlements');
        
        List<Map<String, Object>> result = new List<Map<String, Object>>();
        
        for (Map<String, Object> settlement : optimalSettlements) {
            result.add(new Map<String, Object>{
                'fromPlayerId' => settlement.get('fromPlayerId'),
                'toPlayerId' => settlement.get('toPlayerId'),
                'amount' => settlement.get('amount'),
                'formattedAmount' => settlement.get('amount') != null ? String.valueOf(((Decimal)settlement.get('amount')).setScale(2)) : '',
                'fromPlayerName' => getPlayerNameById((String)settlement.get('fromPlayerId')),
                'toPlayerName' => getPlayerNameById((String)settlement.get('toPlayerId')),
                'description' => settlement.get('description'),
                'settlementNumber' => result.size() + 1
            });
        }
        
        // Add summary information
        Map<String, Object> response = new Map<String, Object>{
            'settlements' => result,
            'totalSettlements' => result.size(),
            'totalDebt' => analysis.get('totalDebt'),
            'totalCredit' => analysis.get('totalCredit'),
            'isBalanced' => analysis.get('isBalanced'),
            'creditors' => analysis.get('creditors'),
            'debtors' => analysis.get('debtors')
        };
        
        return JSON.serialize(response);
    } catch (Exception e) {
        throw new AuraHandledException('Error calculating optimal settlements: ' + e.getMessage());
    }
}

/**
 * Helper method to get player name by ID
 */
private static String getPlayerNameById(String playerId) {
    try {
        Player__c player = [SELECT Name FROM Player__c WHERE Id = :playerId LIMIT 1];
        return player.Name;
    } catch (Exception e) {
        return 'Unknown Player';
    }
}

@AuraEnabled
public static String createSettlement(String sessionToken, String settlementData) {
    try {
        System.debug('createSettlement called. sessionToken: ' + sessionToken + ', settlementData: ' + settlementData);
        // Validate session
        Id currentPlayerId = PlayerSessionService.getPlayerFromSession(sessionToken);
        if (currentPlayerId == null) {
            System.debug('Invalid session in createSettlement');
            throw new AuraHandledException('Invalid session');
        }
        // Parse settlement data
        Map<String, Object> settlementMap = (Map<String, Object>) JSON.deserializeUntyped(settlementData);
        System.debug('Parsed settlementMap: ' + settlementMap);
        // Create settlement record
        Settlement__c settlement = new Settlement__c(
            Group__c = (String) settlementMap.get('groupId'),
            From_Player__c = (String) settlementMap.get('fromPlayer'),
            To_Player__c = (String) settlementMap.get('toPlayer'),
            Amount__c = Decimal.valueOf(String.valueOf(settlementMap.get('amount'))),
            Date__c = Date.today(),
            Status__c = 'Pending',
            Notes__c = (String) settlementMap.get('notes'),
            Payment_Method__c = (String) settlementMap.get('paymentMethod'),
            Reference_Number__c = (String) settlementMap.get('referenceNumber')
        );
        insert settlement;
        System.debug('Settlement inserted: ' + settlement);
        // Recalculate group balances after creating a settlement
        System.debug('Calling ExpenseCalculationService.calculateGroupBalances for groupId: ' + settlement.Group__c);
        ExpenseCalculationService.calculateGroupBalances(settlement.Group__c);
        System.debug('Finished recalculating balances for groupId: ' + settlement.Group__c);
        return JSON.serialize(new Map<String, Object>{
            'success' => true,
            'settlementId' => settlement.Id,
            'message' => 'Settlement created successfully'
        });
    } catch (Exception e) {
        System.debug('Error in createSettlement: ' + e.getMessage());
        throw new AuraHandledException('Error creating settlement: ' + e.getMessage());
    }
}

@AuraEnabled
public static String confirmSettlement(String sessionToken, String settlementId) {
    try {
        // Validate session
        Id playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
        if (playerId == null) {
            throw new AuraHandledException('Invalid session');
        }
        
        // Update settlement status
        Settlement__c settlement = [
            SELECT Id, Status__c, Group__c, Amount__c, From_Player__c, To_Player__c
            FROM Settlement__c 
            WHERE Id = :settlementId
        ];
        
        settlement.Status__c = 'Confirmed';
        update settlement;
        
        // Recalculate group balances
        ExpenseCalculationService.calculateGroupBalances(settlement.Group__c);
        
        return JSON.serialize(new Map<String, Object>{
            'success' => true,
            'message' => 'Settlement confirmed successfully'
        });
        
    } catch (Exception e) {
        throw new AuraHandledException('Error confirming settlement: ' + e.getMessage());
    }
}

@AuraEnabled
public static String getMemberExpenseHistory(String sessionToken, String memberId) {
    try {
        // Validate session
        Id playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
        if (playerId == null) {
            throw new AuraHandledException('Invalid session');
        }
        
        Group_Member__c member = [
            SELECT Id, Player__c, Group__c 
            FROM Group_Member__c 
            WHERE Id = :memberId
        ];
        
        // Get expenses paid by this member
        List<Expense__c> paidExpenses = [
            SELECT Id, Name, Amount__c, Date__c, Category__c
            FROM Expense__c
            WHERE Group__c = :member.Group__c
            AND Paid_By__c = :member.Player__c
            AND Status__c = 'Active'
            ORDER BY Date__c DESC
            LIMIT 50
        ];
        
        // Get expense splits for this member
        List<Expense_Split__c> memberSplits = [
            SELECT Id, Expense__r.Name, Expense__r.Date__c, 
                   Expense__r.Paid_By__r.Name, Amount__c, Is_Paid__c
            FROM Expense_Split__c
            WHERE Player__c = :member.Player__c
            AND Expense__r.Group__c = :member.Group__c
            AND Expense__r.Status__c = 'Active'
            ORDER BY Expense__r.Date__c DESC
            LIMIT 50
        ];
        
        Map<String, Object> history = new Map<String, Object>();
        history.put('paidExpenses', paidExpenses);
        history.put('memberSplits', memberSplits);
        
        return JSON.serialize(history);
        
    } catch (Exception e) {
        throw new AuraHandledException('Error retrieving expense history: ' + e.getMessage());
    }
}
// Additional methods to add to SettleUpController.cls

@AuraEnabled
public static List<Group_Member__c> getGroupMembers(Id groupId, String sessionToken) {
    try {
        // Validate session
        Id playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
        if (playerId == null) {
            throw new AuraHandledException('Invalid session');
        }
        
        // Get all active members of the group
        return [SELECT Id, Player__c, Player__r.Name, Player__r.Email__c, 
                       Nickname__c, Role__c, Status__c
                FROM Group_Member__c 
                WHERE Group__c = :groupId 
                AND Status__c = 'Active'
                ORDER BY Player__r.Name];
                
    } catch (Exception e) {
        throw new AuraHandledException('Error retrieving group members: ' + e.getMessage());
    }
}

// This method must NOT be cacheable=true. It is for imperative Apex calls only.
@AuraEnabled(cacheable=true)
public static String getExpenseDetailsV2(Id expenseId, String sessionToken) {
    try {
        System.debug('getExpenseDetailsV2 called with expenseId: ' + expenseId + ', sessionToken: ' + sessionToken);
        
        // Validate session
        Id playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
        if (playerId == null) {
            System.debug('getExpenseDetailsV2: Invalid session');
            return JSON.serialize(new Map<String, Object>{
                'success' => false,
                'message' => 'Invalid session'
            });
        }
        
        System.debug('getExpenseDetailsV2: Querying expense with ID: ' + expenseId);
        List<Expense__c> expenses = [SELECT Id, Name, Amount__c, Date__c, Category__c, Notes__c, 
                       Paid_By__c, Split_Method__c, Location__c,
                       (SELECT Id, Player__c, Amount__c, Percentage__c, Shares__c, Is_Paid__c
                        FROM Expense_Split__r)
                FROM Expense__c 
                WHERE Id = :expenseId 
                LIMIT 1];
        
        System.debug('getExpenseDetailsV2: Found ' + expenses.size() + ' expenses');
        
        if (expenses.isEmpty()) {
            System.debug('getExpenseDetailsV2: No expense found');
            return JSON.serialize(new Map<String, Object>{
                'success' => false,
                'message' => 'Expense not found'
            });
        }
        
        // Convert SObject to Map to avoid serialization issues
        Expense__c expense = expenses[0];
        Map<String, Object> expenseMap = new Map<String, Object>{
            'Id' => expense.Id,
            'Name' => expense.Name,
            'Amount__c' => expense.Amount__c,
            'Date__c' => expense.Date__c,
            'Category__c' => expense.Category__c,
            'Notes__c' => expense.Notes__c,
            'Paid_By__c' => expense.Paid_By__c,
            'Split_Method__c' => expense.Split_Method__c,
            'Location__c' => expense.Location__c
        };
        
        // Convert expense splits to Maps
        List<Map<String, Object>> splitsList = new List<Map<String, Object>>();
        if (expense.Expense_Split__r != null) {
            for (Expense_Split__c split : expense.Expense_Split__r) {
                splitsList.add(new Map<String, Object>{
                    'Id' => split.Id,
                    'Player__c' => split.Player__c,
                    'Amount__c' => split.Amount__c,
                    'Percentage__c' => split.Percentage__c,
                    'Shares__c' => split.Shares__c,
                    'Is_Paid__c' => split.Is_Paid__c
                });
            }
        }
        expenseMap.put('Expense_Split__r', splitsList);
        
        System.debug('getExpenseDetailsV2: Returning expense data');
        return JSON.serialize(new Map<String, Object>{
            'success' => true,
            'expense' => expenseMap
        });
                
    } catch (Exception e) {
        System.debug('Error in getExpenseDetailsV2: ' + e.getMessage() + '\n' + e.getStackTraceString());
        return JSON.serialize(new Map<String, Object>{
            'success' => false,
            'message' => 'Error retrieving expense details: ' + e.getMessage()
        });
    }
}

@AuraEnabled
public static String removeExpense(String sessionToken, String expenseId) {
    try {
        // Validate session
        Id playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
        if (playerId == null) {
            throw new AuraHandledException('Invalid session');
        }
        
        // Get expense to find group for balance recalculation
        Expense__c expense = [SELECT Group__c FROM Expense__c WHERE Id = :expenseId LIMIT 1];
        
        // Delete splits first (due to master-detail relationship)
        delete [SELECT Id FROM Expense_Split__c WHERE Expense__c = :expenseId];
        
        // Update expense status instead of deleting (for audit trail)
        expense.Status__c = 'Deleted';
        update expense;
        
        // Recalculate group balances
        ExpenseCalculationService.calculateGroupBalances(expense.Group__c);
        
        return JSON.serialize(new Map<String, Object>{
            'success' => true,
            'message' => 'Expense removed successfully'
        });
        
    } catch (Exception e) {
        System.debug('Remove expense error: ' + e.getMessage());
        return createErrorResponse('Failed to remove expense: ' + e.getMessage());
    }
}

@AuraEnabled(cacheable=true)
public static List<Expense__c> getGroupExpenses(Id groupId, String sessionToken) {
    try {
        // Validate session
        Id playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
        if (playerId == null) {
            throw new AuraHandledException('Invalid session');
        }
        
        return [SELECT Id, Name, Amount__c, Date__c, Category__c, Notes__c,
                       Paid_By__c, Paid_By__r.Name, Split_Method__c, Location__c,
                       Created_Date__c
                FROM Expense__c 
                WHERE Group__c = :groupId 
                AND Status__c = 'Active'
                ORDER BY Date__c DESC, Created_Date__c DESC];
                
    } catch (Exception e) {
        throw new AuraHandledException('Error retrieving group expenses: ' + e.getMessage());
    }
}

@AuraEnabled(cacheable=true)
public static Map<String, Object> getExpenseSplitDetails(Id expenseId, String sessionToken) {
    try {
        // Validate session
        Id playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
        if (playerId == null) {
            throw new AuraHandledException('Invalid session');
        }
        
        List<Expense_Split__c> splits = [SELECT Id, Player__c, Player__r.Name, 
                                                Amount__c, Percentage__c, Shares__c, Is_Paid__c
                                         FROM Expense_Split__c 
                                         WHERE Expense__c = :expenseId
                                         ORDER BY Player__r.Name];
        
        Expense__c expense = [SELECT Id, Name, Amount__c, Paid_By__r.Name 
                              FROM Expense__c 
                              WHERE Id = :expenseId 
                              LIMIT 1];
        
        return new Map<String, Object>{
            'expense' => expense,
            'splits' => splits
        };
        
    } catch (Exception e) {
        throw new AuraHandledException('Error retrieving expense split details: ' + e.getMessage());
    }
}

/**
 * Get detailed group information including members, expenses, and balances
 * @param sessionToken Session token for authentication
 * @param groupId Group ID to get details for
 * @return JSON string with group details
 */
@AuraEnabled
public static String getGroupDetails(String sessionToken, String groupId) {
    try {
        // Validate session
        Id playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
        if (playerId == null) {
            throw new AuraHandledException('Invalid session');
        }
        
        // Get group information
        Group__c groups = [
            SELECT Id, Name, Description__c, Currency__c, Total_Expenses__c, 
                   Member_Count__c, Group_Code__c, Created_Date__c, Last_Activity__c
            FROM Group__c 
            WHERE Id = :groupId 
            AND Status__c = 'Active'
            LIMIT 1
        ];
        
        if (groups == null) {
            throw new AuraHandledException('Group not found');
        }
        
        // Get group members
        List<Group_Member__c> members = [
            SELECT Id, Player__c, Player__r.Name, Player__r.Email__c, Player__r.Avatar_URL__c,
                   Nickname__c, Role__c, Total_Paid__c, Total_Owed__c, Net_Balance__c, CreatedDate
            FROM Group_Member__c 
            WHERE Group__c = :groupId 
            AND Status__c = 'Active'
            ORDER BY Player__r.Name
        ];
        
        // Get recent expenses
        List<Expense__c> expenses = [
            SELECT Id, Name, Amount__c, Date__c, Category__c, Notes__c,
                   Paid_By__c, Paid_By__r.Name, Split_Method__c, Location__c
            FROM Expense__c 
            WHERE Group__c = :groupId 
            AND Status__c = 'Active'
            ORDER BY Date__c DESC, Created_Date__c DESC
            LIMIT 20
        ];
        
        // Get recent settlements
        List<Settlement__c> settlements = [
            SELECT Id, From_Player__c, From_Player__r.Name, To_Player__c, To_Player__r.Name,
                   Amount__c, Date__c, Status__c, Notes__c, Payment_Method__c
            FROM Settlement__c 
            WHERE Group__c = :groupId 
            ORDER BY Date__c DESC, Created_Date__c DESC
            LIMIT 10
        ];
        
        // Get member balances
        List<Map<String, Object>> balances = new List<Map<String, Object>>();
        for (Group_Member__c member : members) {
            // Calculate outstanding balance (what's still owed after settlements)
            Decimal outstandingBalance = ExpenseCalculationService.calculateOutstandingBalance(member);
            
            Map<String, Object> balance = new Map<String, Object>();
            balance.put('playerId', member.Player__c);
            balance.put('playerName', member.Player__r.Name);
            balance.put('nickname', member.Nickname__c);
            balance.put('totalPaid', member.Total_Paid__c != null ? member.Total_Paid__c : 0);
            balance.put('totalOwed', member.Total_Owed__c != null ? member.Total_Owed__c : 0);
            balance.put('netBalance', outstandingBalance); // Use outstanding balance instead of stored Net_Balance__c
            balance.put('isOwed', outstandingBalance > 0.01);
            balance.put('owes', outstandingBalance < -0.01);
            balance.put('isSettled', Math.abs(outstandingBalance) <= 0.01);
            balances.add(balance);
        }
        
        Map<String, Object> response = new Map<String, Object>{
            'success' => true,
            'group' => groups,
            'members' => members,
            'expenses' => expenses,
            'settlements' => settlements,
            'balances' => balances
        };
        
        return JSON.serialize(response);
        
    } catch (Exception e) {
        System.debug('Get group details error: ' + e.getMessage());
        return createErrorResponse('Failed to get group details: ' + e.getMessage());
    }
}

/**
 * Get group settlements
 * @param sessionToken Session token for authentication
 * @param groupId Group ID to get settlements for
 * @return JSON string with settlements
 */
@AuraEnabled
public static String getGroupSettlements(String sessionToken, String groupId) {
    try {
        // Validate session
        Id playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
        if (playerId == null) {
            throw new AuraHandledException('Invalid session');
        }
        
        List<Settlement__c> settlements = [
            SELECT Id, From_Player__c, From_Player__r.Name, To_Player__c, To_Player__r.Name,
                   Amount__c, Date__c, Status__c, Notes__c, Payment_Method__c
            FROM Settlement__c 
            WHERE Group__c = :groupId 
            ORDER BY Date__c DESC, Created_Date__c DESC
        ];
        
        return JSON.serialize(settlements);
        
    } catch (Exception e) {
        System.debug('Get settlements error: ' + e.getMessage());
        return createErrorResponse('Failed to get settlements: ' + e.getMessage());
    }
}

/**
 * Cancel a settlement
 * @param sessionToken Session token for authentication
 * @param settlementId Settlement ID to cancel
 * @return JSON string with result
 */
@AuraEnabled
public static String cancelSettlement(String sessionToken, String settlementId) {
    try {
        // Validate session
        Id playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
        if (playerId == null) {
            throw new AuraHandledException('Invalid session');
        }
        
        // Get settlement
        Settlement__c settlement = [
            SELECT Id, Status__c, Group__c, From_Player__c
            FROM Settlement__c 
            WHERE Id = :settlementId
        ];
        
        if (settlement == null) {
            throw new AuraHandledException('Settlement not found');
        }
        
        if (settlement.Status__c != 'Pending') {
            throw new AuraHandledException('Only pending settlements can be cancelled');
        }
        
        if (settlement.From_Player__c != playerId) {
            throw new AuraHandledException('Only the payer can cancel a settlement');
        }
        
        // Update settlement status
        settlement.Status__c = 'Cancelled';
        update settlement;
        
        return JSON.serialize(new Map<String, Object>{
            'success' => true,
            'message' => 'Settlement cancelled successfully'
        });
        
    } catch (Exception e) {
        System.debug('Cancel settlement error: ' + e.getMessage());
        return createErrorResponse('Failed to cancel settlement: ' + e.getMessage());
    }
}

/**
 * End player session (logout)
 * @param sessionToken Session token to end
 * @return Success message
 */
@AuraEnabled
public static String endSession(String sessionToken) {
    try {
        PlayerSessionService.endSession(sessionToken);
        return 'Session ended successfully';
        
    } catch (Exception e) {
        System.debug('End session error: ' + e.getMessage());
        throw new AuraHandledException('Failed to end session: ' + e.getMessage());
    }
}

/**
 * Get group summary information
 * @param sessionToken Session token for authentication
 * @param groupId Group ID to get summary for
 * @return JSON string with group summary
 */
@AuraEnabled
public static String getGroupSummary(String sessionToken, String groupId) {
    try {
        // Validate session
        Id playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
        if (playerId == null) {
            throw new AuraHandledException('Invalid session');
        }
        
        // Get group information
        Group__c groups = [
            SELECT Id, Name, Description__c, Currency__c, Total_Expenses__c, 
                   Member_Count__c, Group_Code__c, Created_Date__c, Last_Activity__c
            FROM Group__c 
            WHERE Id = :groupId 
            AND Status__c = 'Active'
            LIMIT 1
        ];
        
        if (groups == null) {
            throw new AuraHandledException('Group not found');
        }
        
        // Get member count
        Integer memberCount = [
            SELECT COUNT() 
            FROM Group_Member__c 
            WHERE Group__c = :groupId 
            AND Status__c = 'Active'
        ];
        
        // Get total expenses
        List<AggregateResult> expenseResults = [
            SELECT SUM(Amount__c) total 
            FROM Expense__c 
            WHERE Group__c = :groupId 
            AND Status__c = 'Active'
        ];
        Decimal totalExpenses = expenseResults.isEmpty() ? 0 : (Decimal)expenseResults[0].get('total');
        
        // Get pending settlements count
        Integer pendingSettlements = [
            SELECT COUNT() 
            FROM Settlement__c 
            WHERE Group__c = :groupId 
            AND Status__c = 'Pending'
        ];
        
        // Get current player's balance
        Group_Member__c currentMember = [
            SELECT Id, Net_Balance__c, Total_Paid__c, Total_Owed__c
            FROM Group_Member__c 
            WHERE Group__c = :groupId 
            AND Player__c = :playerId
            AND Status__c = 'Active'
            LIMIT 1
        ];
        
        // Calculate outstanding balance for current player
        Decimal currentPlayerOutstandingBalance = 0;
        if (currentMember != null) {
            currentPlayerOutstandingBalance = ExpenseCalculationService.calculateOutstandingBalance(currentMember);
        }
        
        Map<String, Object> summary = new Map<String, Object>{
            'groupId' => groups.Id,
            'groupName' => groups.Name,
            'description' => groups.Description__c,
            'currency' => groups.Currency__c,
            'memberCount' => memberCount,
            'totalExpenses' => totalExpenses != null ? totalExpenses : 0,
            'pendingSettlements' => pendingSettlements,
            'currentPlayerBalance' => currentPlayerOutstandingBalance, // Use outstanding balance instead of stored Net_Balance__c
            'currentPlayerPaid' => currentMember != null ? currentMember.Total_Paid__c : 0,
            'currentPlayerOwed' => currentMember != null ? currentMember.Total_Owed__c : 0,
            'lastActivity' => groups.Last_Activity__c,
            'createdDate' => groups.Created_Date__c
        };
        
        return JSON.serialize(summary);
        
    } catch (Exception e) {
        System.debug('Get group summary error: ' + e.getMessage());
        return createErrorResponse('Failed to get group summary: ' + e.getMessage());
    }
}

@AuraEnabled
public static String getOutstandingBalances(String sessionToken, String groupId) {
    try {
        // Validate session
        Id playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
        if (playerId == null) {
            throw new AuraHandledException('Invalid session');
        }
        
        // Get all group members
        List<Group_Member__c> members = [
            SELECT Id, Player__c, Player__r.Name, Total_Paid__c, Total_Owed__c
            FROM Group_Member__c 
            WHERE Group__c = :groupId 
            AND Status__c = 'Active'
            ORDER BY Player__r.Name
        ];
        
        List<Map<String, Object>> outstandingBalances = new List<Map<String, Object>>();
        
        for (Group_Member__c member : members) {
            // Calculate outstanding balance for this member
            Decimal outstandingBalance = ExpenseCalculationService.calculateOutstandingBalance(member);
            
            outstandingBalances.add(new Map<String, Object>{
                'playerId' => member.Player__c,
                'playerName' => member.Player__r.Name,
                'outstandingBalance' => outstandingBalance,
                'formattedOutstandingBalance' => outstandingBalance != null ? String.valueOf(outstandingBalance.setScale(2)) : '0.00',
                'totalPaid' => member.Total_Paid__c,
                'totalOwed' => member.Total_Owed__c,
                'status' => outstandingBalance > 0.01 ? 'owed' : (outstandingBalance < -0.01 ? 'owes' : 'settled')
            });
        }
        
        return JSON.serialize(outstandingBalances);
        
    } catch (Exception e) {
        throw new AuraHandledException('Error getting outstanding balances: ' + e.getMessage());
    }
}

// Wrapper Classes

public class GroupWrapper {
    @AuraEnabled public Id groupId;
    @AuraEnabled public String groupName;
    @AuraEnabled public String description;
    @AuraEnabled public String currencs;
    @AuraEnabled public Decimal totalExpenses;
    @AuraEnabled public Integer memberCount;
    @AuraEnabled public String groupCode;
    @AuraEnabled public String playerRole;
    @AuraEnabled public Decimal netBalance;
    @AuraEnabled public DateTime lastActivity;
    @AuraEnabled public Date createdDate;
}

@AuraEnabled(cacheable=true)
public static String getExpenseDetailsV3(Id expenseId, String sessionToken) {
    try {
        System.debug('getExpenseDetailsV3 called with expenseId: ' + expenseId + ', sessionToken: ' + sessionToken);
        
        // Validate session
        Id playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
        if (playerId == null) {
            System.debug('getExpenseDetailsV3: Invalid session');
            return JSON.serialize(new Map<String, Object>{
                'success' => false,
                'message' => 'Invalid session'
            });
        }
        
        System.debug('getExpenseDetailsV3: Querying expense with ID: ' + expenseId);
        List<Expense__c> expenses = [SELECT Id, Name, Amount__c, Date__c, Category__c, Notes__c, 
                       Paid_By__c, Split_Method__c, Location__c,
                       (SELECT Id, Player__c, Amount__c, Percentage__c, Shares__c, Is_Paid__c
                        FROM Expense_Split__r)
                FROM Expense__c 
                WHERE Id = :expenseId 
                LIMIT 1];
        
        System.debug('getExpenseDetailsV3: Found ' + expenses.size() + ' expenses');
        
        if (expenses.isEmpty()) {
            System.debug('getExpenseDetailsV3: No expense found');
            return JSON.serialize(new Map<String, Object>{
                'success' => false,
                'message' => 'Expense not found'
            });
        }
        
        // Convert SObject to Map to avoid serialization issues
        Expense__c expense = expenses[0];
        Map<String, Object> expenseMap = new Map<String, Object>{
            'Id' => expense.Id,
            'Name' => expense.Name,
            'Amount__c' => expense.Amount__c,
            'Date__c' => expense.Date__c,
            'Category__c' => expense.Category__c,
            'Notes__c' => expense.Notes__c,
            'Paid_By__c' => expense.Paid_By__c,
            'Split_Method__c' => expense.Split_Method__c,
            'Location__c' => expense.Location__c
        };
        
        // Convert expense splits to Maps
        List<Map<String, Object>> splitsList = new List<Map<String, Object>>();
        if (expense.Expense_Split__r != null) {
            for (Expense_Split__c split : expense.Expense_Split__r) {
                splitsList.add(new Map<String, Object>{
                    'Id' => split.Id,
                    'Player__c' => split.Player__c,
                    'Amount__c' => split.Amount__c,
                    'Percentage__c' => split.Percentage__c,
                    'Shares__c' => split.Shares__c,
                    'Is_Paid__c' => split.Is_Paid__c
                });
            }
        }
        expenseMap.put('Expense_Split__r', splitsList);
        
        System.debug('getExpenseDetailsV3: Returning expense data');
        return JSON.serialize(new Map<String, Object>{
            'success' => true,
            'expense' => expenseMap
        });
                
    } catch (Exception e) {
        System.debug('Error in getExpenseDetailsV3: ' + e.getMessage() + '\n' + e.getStackTraceString());
        return JSON.serialize(new Map<String, Object>{
            'success' => false,
            'message' => 'Error retrieving expense details: ' + e.getMessage()
        });
    }
}

@AuraEnabled
public static Map<String, Object> updateExpenseSimple(String sessionToken, String expenseId, String expenseData, String splits, String groupId) {
    try {
        System.debug('updateExpenseSimple called with:');
        System.debug('sessionToken: ' + sessionToken);
        System.debug('expenseId: ' + expenseId);
        System.debug('expenseData: ' + expenseData);
        System.debug('splits: ' + splits);
        System.debug('groupId: ' + groupId);
        
        // Validate input parameters
        if (String.isBlank(sessionToken)) {
            throw new AuraHandledException('Session token is required');
        }
        
        if (String.isBlank(expenseId)) {
            throw new AuraHandledException('Expense ID is required');
        }
        
        if (String.isBlank(expenseData)) {
            throw new AuraHandledException('Expense data is required');
        }
        
        if (String.isBlank(splits)) {
            throw new AuraHandledException('Splits data is required');
        }
        
        if (String.isBlank(groupId)) {
            throw new AuraHandledException('Group ID is required');
        }
        
        Id playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
        if (playerId == null) {
            throw new AuraHandledException('Invalid session');
        }
        
        System.debug('Parsing expense data: ' + expenseData);
        Map<String, Object> expenseMap = (Map<String, Object>) JSON.deserializeUntyped(expenseData);
        if (expenseMap == null) {
            throw new AuraHandledException('Failed to parse expense data');
        }
        
        System.debug('Parsing splits data: ' + splits);
        List<Object> splitsList = (List<Object>) JSON.deserializeUntyped(splits);
        if (splitsList == null) {
            throw new AuraHandledException('Failed to parse splits data');
        }
        
        // Validate required expense fields
        String expenseName = (String) expenseMap.get('name');
        if (String.isBlank(expenseName)) {
            throw new AuraHandledException('Expense name is required');
        }
        
        String paidBy = (String) expenseMap.get('paidBy');
        if (String.isBlank(paidBy)) {
            throw new AuraHandledException('Paid By is required');
        }
        
        Object amountObj = expenseMap.get('amount');
        if (amountObj == null) {
            throw new AuraHandledException('Amount is required');
        }
        
        Decimal amount;
        try {
            amount = Decimal.valueOf(String.valueOf(amountObj));
        } catch (Exception e) {
            throw new AuraHandledException('Invalid amount format');
        }
        
        if (amount <= 0) {
            throw new AuraHandledException('Amount must be greater than 0');
        }
        
        // Update expense record
        Expense__c expense = new Expense__c(
            Id = expenseId,
            Name = expenseName,
            Paid_By__c = paidBy,
            Amount__c = amount,
            Date__c = Date.valueOf((String) expenseMap.get('date')),
            Category__c = (String) expenseMap.get('category'),
            Notes__c = (String) expenseMap.get('notes'),
            Split_Method__c = (String) expenseMap.get('splitMethod'),
            Location__c = (String) expenseMap.get('location')
        );
        
        System.debug('Updating expense: ' + expense);
        update expense;
        
        // Delete existing splits
        delete [SELECT Id FROM Expense_Split__c WHERE Expense__c = :expenseId];
        
        // Create new expense splits
        List<Expense_Split__c> expenseSplits = new List<Expense_Split__c>();
        for (Object splitObj : splitsList) {
            if (splitObj == null) {
                System.debug('Skipping null split object');
                continue;
            }
            
            Map<String, Object> split = (Map<String, Object>) splitObj;
            if (split == null) {
                System.debug('Skipping null split map');
                continue;
            }
            
            String playerIdStr = (String) split.get('playerId');
            if (String.isBlank(playerIdStr)) {
                System.debug('Skipping split with null playerId');
                continue;
            }
            
            Object amountSplitObj = split.get('amount');
            if (amountSplitObj == null) {
                System.debug('Skipping split with null amount for player: ' + playerIdStr);
                continue;
            }
            
            Decimal splitAmount;
            try {
                splitAmount = Decimal.valueOf(String.valueOf(amountSplitObj));
            } catch (Exception e) {
                System.debug('Invalid split amount for player ' + playerIdStr + ': ' + amountSplitObj);
                continue;
            }
            
            Expense_Split__c expenseSplit = new Expense_Split__c(
                Expense__c = expenseId,
                Player__c = playerIdStr,
                Amount__c = splitAmount,
                Percentage__c = split.get('percentage') != null ? 
                    Decimal.valueOf(String.valueOf(split.get('percentage'))) : null,
                Shares__c = split.get('shares') != null ? 
                    Decimal.valueOf(String.valueOf(split.get('shares'))) : null,
                Is_Paid__c = playerIdStr.equals(expense.Paid_By__c)
            );
            
            System.debug('Creating expense split: ' + expenseSplit);
            expenseSplits.add(expenseSplit);
        }
        
        if (!expenseSplits.isEmpty()) {
            System.debug('Inserting ' + expenseSplits.size() + ' expense splits');
            insert expenseSplits;
        } else {
            System.debug('No valid expense splits to insert');
        }
        
        // Recalculate group balances
        System.debug('Recalculating group balances for group: ' + groupId);
        ExpenseCalculationService.calculateGroupBalances(groupId);
        
        return new Map<String, Object>{
            'success' => true,
            'expenseId' => expenseId,
            'message' => 'Expense updated successfully'
        };
        
    } catch (Exception e) {
        System.debug('Error in updateExpenseSimple: ' + e.getMessage() + '\n' + e.getStackTraceString());
        return new Map<String, Object>{
            'success' => false,
            'message' => 'Error updating expense: ' + e.getMessage()
        };
    }
}

@AuraEnabled
public static String saveExpense(String requestJson) {
    try {
        System.debug('saveExpense called with requestJson: ' + requestJson);
        
        // Validate input parameter
        if (String.isBlank(requestJson)) {
            throw new AuraHandledException('Request JSON is required');
        }
        
        // Parse the request JSON
        Map<String, Object> requestMap;
        try {
            requestMap = (Map<String, Object>) JSON.deserializeUntyped(requestJson);
            System.debug('Successfully parsed request JSON: ' + requestMap);
        } catch (Exception e) {
            System.debug('Error parsing request JSON: ' + e.getMessage());
            throw new AuraHandledException('Invalid JSON format: ' + e.getMessage());
        }
        
        // Extract parameters
        String groupId = (String) requestMap.get('groupId');
        String sessionToken = (String) requestMap.get('sessionToken');
        String expenseDataStr = (String) requestMap.get('expenseData');
        String splitsStr = (String) requestMap.get('splits');
        
        System.debug('saveExpense extracted - groupId: ' + groupId);
        System.debug('saveExpense extracted - sessionToken: ' + sessionToken);
        System.debug('saveExpense extracted - expenseDataStr: ' + expenseDataStr);
        System.debug('saveExpense extracted - splitsStr: ' + splitsStr);
        
        // Validate input parameters
        if (String.isBlank(groupId)) {
            throw new AuraHandledException('Group ID is required');
        }
        
        if (String.isBlank(sessionToken)) {
            throw new AuraHandledException('Session token is required');
        }
        
        Id playerId;
        try {
            playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
            System.debug('Player ID from session: ' + playerId);
        } catch (Exception e) {
            System.debug('Error getting player from session: ' + e.getMessage());
            throw new AuraHandledException('Invalid session: ' + e.getMessage());
        }
        
        if (playerId == null) {
            throw new AuraHandledException('Invalid session');
        }
        
        if (String.isBlank(expenseDataStr)) {
            throw new AuraHandledException('Expense data is required');
        }
        
        if (String.isBlank(splitsStr)) {
            throw new AuraHandledException('Splits data is required');
        }
        
        // Parse expense data
        Map<String, Object> expenseMap;
        try {
            System.debug('Parsing expense data: ' + expenseDataStr);
            expenseMap = (Map<String, Object>) JSON.deserializeUntyped(expenseDataStr);
            if (expenseMap == null) {
                throw new AuraHandledException('Failed to parse expense data');
            }
            System.debug('Successfully parsed expense data: ' + expenseMap);
        } catch (Exception e) {
            System.debug('Error parsing expense data: ' + e.getMessage());
            throw new AuraHandledException('Failed to parse expense data: ' + e.getMessage());
        }
        
        // Parse splits data
        List<Object> splitsList;
        try {
            System.debug('Parsing splits data: ' + splitsStr);
            splitsList = (List<Object>) JSON.deserializeUntyped(splitsStr);
            if (splitsList == null) {
                throw new AuraHandledException('Failed to parse splits data');
            }
            System.debug('Successfully parsed splits data: ' + splitsList);
        } catch (Exception e) {
            System.debug('Error parsing splits data: ' + e.getMessage());
            throw new AuraHandledException('Failed to parse splits data: ' + e.getMessage());
        }
        
        System.debug('Expense map: ' + expenseMap);
        System.debug('Splits list: ' + splitsList);

        // Validate required expense fields
        String expenseName = (String) expenseMap.get('name');
        if (String.isBlank(expenseName)) {
            throw new AuraHandledException('Expense name is required');
        }
        
        String paidBy = (String) expenseMap.get('paidBy');
        if (String.isBlank(paidBy)) {
            throw new AuraHandledException('Paid By is required');
        }
        
        Object amountObj = expenseMap.get('amount');
        if (amountObj == null) {
            throw new AuraHandledException('Amount is required');
        }
        
        Decimal amount;
        try {
            amount = Decimal.valueOf(String.valueOf(amountObj));
            System.debug('Parsed amount: ' + amount);
        } catch (Exception e) {
            System.debug('Error parsing amount: ' + e.getMessage());
            throw new AuraHandledException('Invalid amount format: ' + e.getMessage());
        }
        
        if (amount <= 0) {
            throw new AuraHandledException('Amount must be greater than 0');
        }

        // Create expense record
        Expense__c expense = new Expense__c(
            Name = expenseName,
            Group__c = groupId,
            Paid_By__c = paidBy,
            Amount__c = amount,
            Date__c = Date.valueOf((String) expenseMap.get('date')),
            Category__c = (String) expenseMap.get('category'),
            Notes__c = (String) expenseMap.get('notes'),
            Split_Method__c = (String) expenseMap.get('splitMethod'),
            Location__c = (String) expenseMap.get('location'),
            Status__c = 'Active'
        );
        
        System.debug('Creating expense: ' + expense);
        try {
            insert expense;
            System.debug('Expense created with ID: ' + expense.Id);
        } catch (Exception e) {
            System.debug('Error inserting expense: ' + e.getMessage());
            throw new AuraHandledException('Failed to create expense: ' + e.getMessage());
        }

        // Create expense splits based on provided splits
        List<Expense_Split__c> expenseSplits = new List<Expense_Split__c>();
        for (Object splitObj : splitsList) {
            if (splitObj == null) {
                System.debug('Skipping null split object');
                continue;
            }
            
            Map<String, Object> split;
            try {
                split = (Map<String, Object>) splitObj;
                if (split == null) {
                    System.debug('Skipping null split map');
                    continue;
                }
            } catch (Exception e) {
                System.debug('Error converting split object to map: ' + e.getMessage());
                continue;
            }
            
            String playerIdStr = (String) split.get('playerId');
            if (String.isBlank(playerIdStr)) {
                System.debug('Skipping split with null playerId');
                continue;
            }
            
            Object amountSplitObj = split.get('amount');
            if (amountSplitObj == null) {
                System.debug('Skipping split with null amount for player: ' + playerIdStr);
                continue;
            }
            
            Decimal splitAmount;
            try {
                splitAmount = Decimal.valueOf(String.valueOf(amountSplitObj));
                System.debug('Parsed split amount for player ' + playerIdStr + ': ' + splitAmount);
            } catch (Exception e) {
                System.debug('Invalid split amount for player ' + playerIdStr + ': ' + amountSplitObj + ' - Error: ' + e.getMessage());
                continue;
            }
            
            Expense_Split__c expenseSplit = new Expense_Split__c(
                Expense__c = expense.Id,
                Player__c = playerIdStr,
                Amount__c = splitAmount,
                Percentage__c = split.get('percentage') != null ? 
                    Decimal.valueOf(String.valueOf(split.get('percentage'))) : null,
                Shares__c = split.get('shares') != null ? 
                    Decimal.valueOf(String.valueOf(split.get('shares'))) : null,
                Is_Paid__c = playerIdStr.equals(expense.Paid_By__c)
            );
            
            System.debug('Creating expense split: ' + expenseSplit);
            expenseSplits.add(expenseSplit);
        }
        
        if (expenseSplits.isEmpty()) {
            System.debug('No valid expense splits found');
            throw new AuraHandledException('No valid expense splits provided');
        }
        
        System.debug('Inserting ' + expenseSplits.size() + ' expense splits');
        try {
            insert expenseSplits;
            System.debug('Expense splits created successfully');
        } catch (Exception e) {
            System.debug('Error inserting expense splits: ' + e.getMessage());
            throw new AuraHandledException('Failed to create expense splits: ' + e.getMessage());
        }

        // Recalculate group balances
        try {
            System.debug('Recalculating group balances for group: ' + groupId);
            ExpenseCalculationService.calculateGroupBalances(groupId);
            System.debug('Group balances recalculated successfully');
        } catch (Exception e) {
            System.debug('Error recalculating group balances: ' + e.getMessage());
            // Don't throw here as the expense was created successfully
        }

        Map<String, Object> response = new Map<String, Object>();
        response.put('success', true);
        response.put('expenseId', expense.Id);
        response.put('message', 'Expense added successfully');
        
        System.debug('saveExpense completed successfully');
        return JSON.serialize(response);
        
    } catch (Exception e) {
        System.debug('Error in saveExpense: ' + e.getMessage());
        System.debug('Stack trace: ' + e.getStackTraceString());
        
        Map<String, Object> response = new Map<String, Object>();
        response.put('success', false);
        response.put('message', e.getMessage());
        
        return JSON.serialize(response);
    }
}

@AuraEnabled
public static String addExpenseV2(Object expenseRequest) {
    try {
        System.debug('addExpenseV2 called with expenseRequest: ' + expenseRequest);
        
        // Validate input parameter
        if (expenseRequest == null) {
            throw new AuraHandledException('Expense request is null');
        }
        
        // Convert the object to a map
        Map<String, Object> requestMap;
        try {
            requestMap = (Map<String, Object>) expenseRequest;
            System.debug('Successfully converted expenseRequest to Map: ' + requestMap);
        } catch (Exception e) {
            System.debug('Error converting expenseRequest to Map: ' + e.getMessage());
            throw new AuraHandledException('Invalid request format: ' + e.getMessage());
        }
        
        // Extract parameters
        String groupId = (String) requestMap.get('groupId');
        String sessionToken = (String) requestMap.get('sessionToken');
        String expenseDataStr = (String) requestMap.get('expenseData');
        String splitsStr = (String) requestMap.get('splits');
        
        System.debug('addExpenseV2 extracted - groupId: ' + groupId);
        System.debug('addExpenseV2 extracted - sessionToken: ' + sessionToken);
        System.debug('addExpenseV2 extracted - expenseDataStr: ' + expenseDataStr);
        System.debug('addExpenseV2 extracted - splitsStr: ' + splitsStr);
        
        // Validate input parameters
        if (String.isBlank(groupId)) {
            throw new AuraHandledException('Group ID is required');
        }
        
        if (String.isBlank(sessionToken)) {
            throw new AuraHandledException('Session token is required');
        }
        
        Id playerId;
        try {
            playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
            System.debug('Player ID from session: ' + playerId);
        } catch (Exception e) {
            System.debug('Error getting player from session: ' + e.getMessage());
            throw new AuraHandledException('Invalid session: ' + e.getMessage());
        }
        
        if (playerId == null) {
            throw new AuraHandledException('Invalid session');
        }
        
        if (String.isBlank(expenseDataStr)) {
            throw new AuraHandledException('Expense data is required');
        }
        
        if (String.isBlank(splitsStr)) {
            throw new AuraHandledException('Splits data is required');
        }
        
        // Parse expense data
        Map<String, Object> expenseMap;
        try {
            System.debug('Parsing expense data: ' + expenseDataStr);
            expenseMap = (Map<String, Object>) JSON.deserializeUntyped(expenseDataStr);
            if (expenseMap == null) {
                throw new AuraHandledException('Failed to parse expense data');
            }
            System.debug('Successfully parsed expense data: ' + expenseMap);
        } catch (Exception e) {
            System.debug('Error parsing expense data: ' + e.getMessage());
            throw new AuraHandledException('Failed to parse expense data: ' + e.getMessage());
        }
        
        // Parse splits data
        List<Object> splitsList;
        try {
            System.debug('Parsing splits data: ' + splitsStr);
            splitsList = (List<Object>) JSON.deserializeUntyped(splitsStr);
            if (splitsList == null) {
                throw new AuraHandledException('Failed to parse splits data');
            }
            System.debug('Successfully parsed splits data: ' + splitsList);
        } catch (Exception e) {
            System.debug('Error parsing splits data: ' + e.getMessage());
            throw new AuraHandledException('Failed to parse splits data: ' + e.getMessage());
        }
        
        System.debug('Expense map: ' + expenseMap);
        System.debug('Splits list: ' + splitsList);

        // Validate required expense fields
        String expenseName = (String) expenseMap.get('name');
        if (String.isBlank(expenseName)) {
            throw new AuraHandledException('Expense name is required');
        }
        
        String paidBy = (String) expenseMap.get('paidBy');
        if (String.isBlank(paidBy)) {
            throw new AuraHandledException('Paid By is required');
        }
        
        Object amountObj = expenseMap.get('amount');
        if (amountObj == null) {
            throw new AuraHandledException('Amount is required');
        }
        
        Decimal amount;
        try {
            amount = Decimal.valueOf(String.valueOf(amountObj));
            System.debug('Parsed amount: ' + amount);
        } catch (Exception e) {
            System.debug('Error parsing amount: ' + e.getMessage());
            throw new AuraHandledException('Invalid amount format: ' + e.getMessage());
        }
        
        if (amount <= 0) {
            throw new AuraHandledException('Amount must be greater than 0');
        }

        // Create expense record
        Expense__c expense = new Expense__c(
            Name = expenseName,
            Group__c = groupId,
            Paid_By__c = paidBy,
            Amount__c = amount,
            Date__c = Date.valueOf((String) expenseMap.get('date')),
            Category__c = (String) expenseMap.get('category'),
            Notes__c = (String) expenseMap.get('notes'),
            Split_Method__c = (String) expenseMap.get('splitMethod'),
            Location__c = (String) expenseMap.get('location'),
            Status__c = 'Active'
        );
        
        System.debug('Creating expense: ' + expense);
        try {
            insert expense;
            System.debug('Expense created with ID: ' + expense.Id);
        } catch (Exception e) {
            System.debug('Error inserting expense: ' + e.getMessage());
            throw new AuraHandledException('Failed to create expense: ' + e.getMessage());
        }

        // Create expense splits based on provided splits
        List<Expense_Split__c> expenseSplits = new List<Expense_Split__c>();
        for (Object splitObj : splitsList) {
            if (splitObj == null) {
                System.debug('Skipping null split object');
                continue;
            }
            
            Map<String, Object> split;
            try {
                split = (Map<String, Object>) splitObj;
                if (split == null) {
                    System.debug('Skipping null split map');
                    continue;
                }
            } catch (Exception e) {
                System.debug('Error converting split object to map: ' + e.getMessage());
                continue;
            }
            
            String playerIdStr = (String) split.get('playerId');
            if (String.isBlank(playerIdStr)) {
                System.debug('Skipping split with null playerId');
                continue;
            }
            
            Object amountSplitObj = split.get('amount');
            if (amountSplitObj == null) {
                System.debug('Skipping split with null amount for player: ' + playerIdStr);
                continue;
            }
            
            Decimal splitAmount;
            try {
                splitAmount = Decimal.valueOf(String.valueOf(amountSplitObj));
                System.debug('Parsed split amount for player ' + playerIdStr + ': ' + splitAmount);
            } catch (Exception e) {
                System.debug('Invalid split amount for player ' + playerIdStr + ': ' + amountSplitObj + ' - Error: ' + e.getMessage());
                continue;
            }
            
            Expense_Split__c expenseSplit = new Expense_Split__c(
                Expense__c = expense.Id,
                Player__c = playerIdStr,
                Amount__c = splitAmount,
                Percentage__c = split.get('percentage') != null ? 
                    Decimal.valueOf(String.valueOf(split.get('percentage'))) : null,
                Shares__c = split.get('shares') != null ? 
                    Decimal.valueOf(String.valueOf(split.get('shares'))) : null,
                Is_Paid__c = playerIdStr.equals(expense.Paid_By__c)
            );
            
            System.debug('Creating expense split: ' + expenseSplit);
            expenseSplits.add(expenseSplit);
        }
        
        if (!expenseSplits.isEmpty()) {
            System.debug('Inserting ' + expenseSplits.size() + ' expense splits');
            try {
                insert expenseSplits;
                System.debug('Successfully inserted expense splits');
            } catch (Exception e) {
                System.debug('Error inserting expense splits: ' + e.getMessage());
                throw new AuraHandledException('Failed to create expense splits: ' + e.getMessage());
            }
        } else {
            System.debug('No valid expense splits to insert');
        }

        // Recalculate group balances
        System.debug('Recalculating group balances for group: ' + expense.Group__c);
        try {
            ExpenseCalculationService.calculateGroupBalances(expense.Group__c);
            System.debug('Successfully recalculated group balances');
        } catch (Exception e) {
            System.debug('Error recalculating group balances: ' + e.getMessage());
            // Don't throw here as the expense was already created successfully
        }

        return JSON.serialize(new Map<String, Object>{
            'success' => true,
            'expenseId' => expense.Id,
            'message' => 'Expense added successfully'
        });
    } catch (Exception e) {
        System.debug('Error in addExpenseV2: ' + e.getMessage() + '\n' + e.getStackTraceString());
        return JSON.serialize(new Map<String, Object>{
            'success' => false,
            'message' => 'Error adding expense: ' + e.getMessage()
        });
    }
}

@AuraEnabled
public static String addExpenseV3(String groupId, String sessionToken, String expenseDataStr, String splitsStr) {
    try {
        System.debug('addExpenseV3 called with:');
        System.debug('groupId: ' + groupId);
        System.debug('sessionToken: ' + sessionToken);
        System.debug('expenseDataStr: ' + expenseDataStr);
        System.debug('splitsStr: ' + splitsStr);
        
        // Validate input parameters
        if (String.isBlank(groupId)) {
            throw new AuraHandledException('Group ID is required');
        }
        
        if (String.isBlank(sessionToken)) {
            throw new AuraHandledException('Session token is required');
        }
        
        Id playerId;
        try {
            playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
            System.debug('Player ID from session: ' + playerId);
        } catch (Exception e) {
            System.debug('Error getting player from session: ' + e.getMessage());
            throw new AuraHandledException('Invalid session: ' + e.getMessage());
        }
        
        if (playerId == null) {
            throw new AuraHandledException('Invalid session');
        }
        
        if (String.isBlank(expenseDataStr)) {
            throw new AuraHandledException('Expense data is required');
        }
        
        if (String.isBlank(splitsStr)) {
            throw new AuraHandledException('Splits data is required');
        }
        
        // Parse expense data
        Map<String, Object> expenseMap;
        try {
            System.debug('Parsing expense data: ' + expenseDataStr);
            expenseMap = (Map<String, Object>) JSON.deserializeUntyped(expenseDataStr);
            if (expenseMap == null) {
                throw new AuraHandledException('Failed to parse expense data');
            }
            System.debug('Successfully parsed expense data: ' + expenseMap);
        } catch (Exception e) {
            System.debug('Error parsing expense data: ' + e.getMessage());
            throw new AuraHandledException('Failed to parse expense data: ' + e.getMessage());
        }
        
        // Parse splits data
        List<Object> splitsList;
        try {
            System.debug('Parsing splits data: ' + splitsStr);
            splitsList = (List<Object>) JSON.deserializeUntyped(splitsStr);
            if (splitsList == null) {
                throw new AuraHandledException('Failed to parse splits data');
            }
            System.debug('Successfully parsed splits data: ' + splitsList);
        } catch (Exception e) {
            System.debug('Error parsing splits data: ' + e.getMessage());
            throw new AuraHandledException('Failed to parse splits data: ' + e.getMessage());
        }
        
        System.debug('Expense map: ' + expenseMap);
        System.debug('Splits list: ' + splitsList);

        // Validate required expense fields
        String expenseName = (String) expenseMap.get('name');
        if (String.isBlank(expenseName)) {
            throw new AuraHandledException('Expense name is required');
        }
        
        String paidBy = (String) expenseMap.get('paidBy');
        if (String.isBlank(paidBy)) {
            throw new AuraHandledException('Paid By is required');
        }
        
        Object amountObj = expenseMap.get('amount');
        if (amountObj == null) {
            throw new AuraHandledException('Amount is required');
        }
        
        Decimal amount;
        try {
            amount = Decimal.valueOf(String.valueOf(amountObj));
            System.debug('Parsed amount: ' + amount);
        } catch (Exception e) {
            System.debug('Error parsing amount: ' + e.getMessage());
            throw new AuraHandledException('Invalid amount format: ' + e.getMessage());
        }
        
        if (amount <= 0) {
            throw new AuraHandledException('Amount must be greater than 0');
        }

        // Create expense record
        Expense__c expense = new Expense__c(
            Name = expenseName,
            Group__c = groupId,
            Paid_By__c = paidBy,
            Amount__c = amount,
            Date__c = Date.valueOf((String) expenseMap.get('date')),
            Category__c = (String) expenseMap.get('category'),
            Notes__c = (String) expenseMap.get('notes'),
            Split_Method__c = (String) expenseMap.get('splitMethod'),
            Location__c = (String) expenseMap.get('location'),
            Status__c = 'Active'
        );
        
        System.debug('Creating expense: ' + expense);
        try {
            insert expense;
            System.debug('Expense created with ID: ' + expense.Id);
        } catch (Exception e) {
            System.debug('Error inserting expense: ' + e.getMessage());
            throw new AuraHandledException('Failed to create expense: ' + e.getMessage());
        }

        // Create expense splits based on provided splits
        List<Expense_Split__c> expenseSplits = new List<Expense_Split__c>();
        for (Object splitObj : splitsList) {
            if (splitObj == null) {
                System.debug('Skipping null split object');
                continue;
            }
            
            Map<String, Object> split;
            try {
                split = (Map<String, Object>) splitObj;
                if (split == null) {
                    System.debug('Skipping null split map');
                    continue;
                }
            } catch (Exception e) {
                System.debug('Error converting split object to map: ' + e.getMessage());
                continue;
            }
            
            String playerIdStr = (String) split.get('playerId');
            if (String.isBlank(playerIdStr)) {
                System.debug('Skipping split with null playerId');
                continue;
            }
            
            Object amountSplitObj = split.get('amount');
            if (amountSplitObj == null) {
                System.debug('Skipping split with null amount for player: ' + playerIdStr);
                continue;
            }
            
            Decimal splitAmount;
            try {
                splitAmount = Decimal.valueOf(String.valueOf(amountSplitObj));
                System.debug('Parsed split amount for player ' + playerIdStr + ': ' + splitAmount);
            } catch (Exception e) {
                System.debug('Invalid split amount for player ' + playerIdStr + ': ' + amountSplitObj + ' - Error: ' + e.getMessage());
                continue;
            }
            
            Expense_Split__c expenseSplit = new Expense_Split__c(
                Expense__c = expense.Id,
                Player__c = playerIdStr,
                Amount__c = splitAmount,
                Percentage__c = split.get('percentage') != null ? 
                    Decimal.valueOf(String.valueOf(split.get('percentage'))) : null,
                Shares__c = split.get('shares') != null ? 
                    Decimal.valueOf(String.valueOf(split.get('shares'))) : null,
                Is_Paid__c = playerIdStr.equals(expense.Paid_By__c)
            );
            
            System.debug('Creating expense split: ' + expenseSplit);
            expenseSplits.add(expenseSplit);
        }
        
        if (expenseSplits.isEmpty()) {
            System.debug('No valid expense splits found');
            throw new AuraHandledException('No valid expense splits provided');
        }
        
        System.debug('Inserting ' + expenseSplits.size() + ' expense splits');
        try {
            insert expenseSplits;
            System.debug('Expense splits created successfully');
        } catch (Exception e) {
            System.debug('Error inserting expense splits: ' + e.getMessage());
            throw new AuraHandledException('Failed to create expense splits: ' + e.getMessage());
        }

        // Recalculate group balances
        try {
            System.debug('Recalculating group balances for group: ' + groupId);
            ExpenseCalculationService.calculateGroupBalances(groupId);
            System.debug('Group balances recalculated successfully');
        } catch (Exception e) {
            System.debug('Error recalculating group balances: ' + e.getMessage());
            // Don't throw here as the expense was created successfully
        }

        Map<String, Object> response = new Map<String, Object>();
        response.put('success', true);
        response.put('expenseId', expense.Id);
        response.put('message', 'Expense added successfully');
        
        System.debug('addExpenseV3 completed successfully');
        return JSON.serialize(response);
        
    } catch (Exception e) {
        System.debug('Error in addExpenseV3: ' + e.getMessage());
        System.debug('Stack trace: ' + e.getStackTraceString());
        
        Map<String, Object> response = new Map<String, Object>();
        response.put('success', false);
        response.put('message', e.getMessage());
        
        return JSON.serialize(response);
    }
}

@AuraEnabled
public static String createExpense(String groupId, String sessionToken, String expenseDataStr, String splitsStr) {
    try {
        System.debug('createExpense called with:');
        System.debug('groupId: ' + groupId);
        System.debug('sessionToken: ' + sessionToken);
        System.debug('expenseDataStr: ' + expenseDataStr);
        System.debug('splitsStr: ' + splitsStr);
        
        // Validate input parameters
        if (String.isBlank(groupId)) {
            throw new AuraHandledException('Group ID is required');
        }
        
        if (String.isBlank(sessionToken)) {
            throw new AuraHandledException('Session token is required');
        }
        
        Id playerId;
        try {
            playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
            System.debug('Player ID from session: ' + playerId);
        } catch (Exception e) {
            System.debug('Error getting player from session: ' + e.getMessage());
            throw new AuraHandledException('Invalid session: ' + e.getMessage());
        }
        
        if (playerId == null) {
            throw new AuraHandledException('Invalid session');
        }
        
        if (String.isBlank(expenseDataStr)) {
            throw new AuraHandledException('Expense data is required');
        }
        
        if (String.isBlank(splitsStr)) {
            throw new AuraHandledException('Splits data is required');
        }
        
        // Parse expense data
        Map<String, Object> expenseMap;
        try {
            System.debug('Parsing expense data: ' + expenseDataStr);
            expenseMap = (Map<String, Object>) JSON.deserializeUntyped(expenseDataStr);
            if (expenseMap == null) {
                throw new AuraHandledException('Failed to parse expense data');
            }
            System.debug('Successfully parsed expense data: ' + expenseMap);
        } catch (Exception e) {
            System.debug('Error parsing expense data: ' + e.getMessage());
            throw new AuraHandledException('Failed to parse expense data: ' + e.getMessage());
        }
        
        // Parse splits data
        List<Object> splitsList;
        try {
            System.debug('Parsing splits data: ' + splitsStr);
            splitsList = (List<Object>) JSON.deserializeUntyped(splitsStr);
            if (splitsList == null) {
                throw new AuraHandledException('Failed to parse splits data');
            }
            System.debug('Successfully parsed splits data: ' + splitsList);
        } catch (Exception e) {
            System.debug('Error parsing splits data: ' + e.getMessage());
            throw new AuraHandledException('Failed to parse splits data: ' + e.getMessage());
        }
        
        System.debug('Expense map: ' + expenseMap);
        System.debug('Splits list: ' + splitsList);

        // Validate required expense fields
        String expenseName = (String) expenseMap.get('name');
        if (String.isBlank(expenseName)) {
            throw new AuraHandledException('Expense name is required');
        }
        
        String paidBy = (String) expenseMap.get('paidBy');
        if (String.isBlank(paidBy)) {
            throw new AuraHandledException('Paid By is required');
        }
        
        Object amountObj = expenseMap.get('amount');
        if (amountObj == null) {
            throw new AuraHandledException('Amount is required');
        }
        
        Decimal amount;
        try {
            amount = Decimal.valueOf(String.valueOf(amountObj));
            System.debug('Parsed amount: ' + amount);
        } catch (Exception e) {
            System.debug('Error parsing amount: ' + e.getMessage());
            throw new AuraHandledException('Invalid amount format: ' + e.getMessage());
        }
        
        if (amount <= 0) {
            throw new AuraHandledException('Amount must be greater than 0');
        }

        // Create expense record
        Expense__c expense = new Expense__c(
            Name = expenseName,
            Group__c = groupId,
            Paid_By__c = paidBy,
            Amount__c = amount,
            Date__c = Date.valueOf((String) expenseMap.get('date')),
            Category__c = (String) expenseMap.get('category'),
            Notes__c = (String) expenseMap.get('notes'),
            Split_Method__c = (String) expenseMap.get('splitMethod'),
            Location__c = (String) expenseMap.get('location'),
            Status__c = 'Active'
        );
        
        System.debug('Creating expense: ' + expense);
        try {
            insert expense;
            System.debug('Expense created with ID: ' + expense.Id);
        } catch (Exception e) {
            System.debug('Error inserting expense: ' + e.getMessage());
            throw new AuraHandledException('Failed to create expense: ' + e.getMessage());
        }

        // Create expense splits based on provided splits
        List<Expense_Split__c> expenseSplits = new List<Expense_Split__c>();
        for (Object splitObj : splitsList) {
            if (splitObj == null) {
                System.debug('Skipping null split object');
                continue;
            }
            
            Map<String, Object> split;
            try {
                split = (Map<String, Object>) splitObj;
                if (split == null) {
                    System.debug('Skipping null split map');
                    continue;
                }
            } catch (Exception e) {
                System.debug('Error converting split object to map: ' + e.getMessage());
                continue;
            }
            
            String playerIdStr = (String) split.get('playerId');
            if (String.isBlank(playerIdStr)) {
                System.debug('Skipping split with null playerId');
                continue;
            }
            
            Object amountSplitObj = split.get('amount');
            if (amountSplitObj == null) {
                System.debug('Skipping split with null amount for player: ' + playerIdStr);
                continue;
            }
            
            Decimal splitAmount;
            try {
                splitAmount = Decimal.valueOf(String.valueOf(amountSplitObj));
                System.debug('Parsed split amount for player ' + playerIdStr + ': ' + splitAmount);
            } catch (Exception e) {
                System.debug('Invalid split amount for player ' + playerIdStr + ': ' + amountSplitObj + ' - Error: ' + e.getMessage());
                continue;
            }
            
            Expense_Split__c expenseSplit = new Expense_Split__c(
                Expense__c = expense.Id,
                Player__c = playerIdStr,
                Amount__c = splitAmount,
                Percentage__c = split.get('percentage') != null ? 
                    Decimal.valueOf(String.valueOf(split.get('percentage'))) : null,
                Shares__c = split.get('shares') != null ? 
                    Decimal.valueOf(String.valueOf(split.get('shares'))) : null,
                Is_Paid__c = playerIdStr.equals(expense.Paid_By__c)
            );
            
            System.debug('Creating expense split: ' + expenseSplit);
            expenseSplits.add(expenseSplit);
        }
        
        if (expenseSplits.isEmpty()) {
            System.debug('No valid expense splits found');
            throw new AuraHandledException('No valid expense splits provided');
        }
        
        System.debug('Inserting ' + expenseSplits.size() + ' expense splits');
        try {
            insert expenseSplits;
            System.debug('Expense splits created successfully');
        } catch (Exception e) {
            System.debug('Error inserting expense splits: ' + e.getMessage());
            throw new AuraHandledException('Failed to create expense splits: ' + e.getMessage());
        }

        // Recalculate group balances
        try {
            System.debug('Recalculating group balances for group: ' + groupId);
            ExpenseCalculationService.calculateGroupBalances(groupId);
            System.debug('Group balances recalculated successfully');
        } catch (Exception e) {
            System.debug('Error recalculating group balances: ' + e.getMessage());
            // Don't throw here as the expense was created successfully
        }

        Map<String, Object> response = new Map<String, Object>();
        response.put('success', true);
        response.put('expenseId', expense.Id);
        response.put('message', 'Expense added successfully');
        
        System.debug('createExpense completed successfully');
        return JSON.serialize(response);
        
    } catch (Exception e) {
        System.debug('Error in createExpense: ' + e.getMessage());
        System.debug('Stack trace: ' + e.getStackTraceString());
        
        Map<String, Object> response = new Map<String, Object>();
        response.put('success', false);
        response.put('message', e.getMessage());
        
        return JSON.serialize(response);
    }
}

    @AuraEnabled
    public static String processExpenseCreation(String requestDataJson) {
        try {
            System.debug('processExpenseCreation called with requestDataJson: ' + requestDataJson);
            
            // Deserialize the JSON string to get the request data
            Map<String, Object> requestData;
            try {
                requestData = (Map<String, Object>) JSON.deserializeUntyped(requestDataJson);
                System.debug('Deserialized requestData: ' + JSON.serializePretty(requestData));
            } catch (Exception e) {
                System.debug('Error deserializing requestDataJson: ' + e.getMessage());
                throw new AuraHandledException('Invalid request data format: ' + e.getMessage());
            }
            
            // Validate input parameter
            if (requestData == null) {
                throw new AuraHandledException('Request data is required');
            }
            
            // Validate required fields
            if (!requestData.containsKey('groupId') || !requestData.containsKey('sessionToken') ||
                !requestData.containsKey('expenseData') || !requestData.containsKey('splits')) {
                throw new AuraHandledException('Missing required fields in request data');
            }
            
            // Extract parameters
            String groupId = (String) requestData.get('groupId');
            String sessionToken = (String) requestData.get('sessionToken');
            Map<String, Object> expenseData = (Map<String, Object>) requestData.get('expenseData');
            List<Object> splitsList = (List<Object>) requestData.get('splits');
            
            System.debug('Extracted - groupId: ' + groupId);
            System.debug('Extracted - sessionToken: ' + sessionToken);
            System.debug('Extracted - expenseData: ' + expenseData);
            System.debug('Extracted - splitsList: ' + splitsList);
            
            // Validate input parameters
            if (String.isBlank(groupId)) {
                throw new AuraHandledException('Group ID is required');
            }
            
            if (String.isBlank(sessionToken)) {
                throw new AuraHandledException('Session token is required');
            }
            
            Id playerId;
            try {
                playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
                System.debug('Player ID from session: ' + playerId);
            } catch (Exception e) {
                System.debug('Error getting player from session: ' + e.getMessage());
                throw new AuraHandledException('Invalid session: ' + e.getMessage());
            }
            
            if (playerId == null) {
                throw new AuraHandledException('Invalid session');
            }
            
            if (expenseData == null) {
                throw new AuraHandledException('Expense data is required');
            }
            
            if (splitsList == null || splitsList.isEmpty()) {
                throw new AuraHandledException('Splits data is required');
            }
            
            // Validate required expense fields
            String expenseName = (String) expenseData.get('name');
            if (String.isBlank(expenseName)) {
                throw new AuraHandledException('Expense name is required');
            }
            
            String paidBy = (String) expenseData.get('paidBy');
            if (String.isBlank(paidBy)) {
                throw new AuraHandledException('Paid By is required');
            }
            
            Object amountObj = expenseData.get('amount');
            if (amountObj == null) {
                throw new AuraHandledException('Amount is required');
            }
            
            String amountStr = String.valueOf(amountObj);
            if (!Pattern.matches('\\d+(\\.\\d+)?', amountStr)) {
                throw new AuraHandledException('Invalid amount format: must be a number');
            }
            
            Decimal amount;
            try {
                amount = Decimal.valueOf(amountStr);
                System.debug('Parsed amount: ' + amount);
            } catch (Exception e) {
                System.debug('Error parsing amount: ' + e.getMessage());
                throw new AuraHandledException('Invalid amount format: ' + e.getMessage());
            }
            
            if (amount <= 0) {
                throw new AuraHandledException('Amount must be greater than 0');
            }

            // Create expense record
            Expense__c expense = new Expense__c(
                Name = expenseName,
                Group__c = groupId,
                Paid_By__c = paidBy,
                Amount__c = amount,
                Date__c = Date.valueOf((String) expenseData.get('date')),
                Category__c = (String) expenseData.get('category'),
                Notes__c = (String) expenseData.get('notes'),
                Split_Method__c = (String) expenseData.get('splitMethod'),
                Location__c = (String) expenseData.get('location'),
                Status__c = 'Active'
            );
            
            System.debug('Creating expense: ' + expense);
            try {
                insert expense;
                System.debug('Expense created with ID: ' + expense.Id);
            } catch (Exception e) {
                System.debug('Error inserting expense: ' + e.getMessage());
                throw new AuraHandledException('Failed to create expense: ' + e.getMessage());
            }

            // Create expense splits based on provided splits
            List<Expense_Split__c> expenseSplits = new List<Expense_Split__c>();
            for (Object splitObj : splitsList) {
                if (splitObj == null) {
                    System.debug('Skipping null split object');
                    continue;
                }
                
                Map<String, Object> split;
                try {
                    split = (Map<String, Object>) splitObj;
                    if (split == null) {
                        System.debug('Skipping null split map');
                        continue;
                    }
                } catch (Exception e) {
                    System.debug('Error converting split object to map: ' + e.getMessage());
                    continue;
                }
                
                String playerIdStr = (String) split.get('playerId');
                if (String.isBlank(playerIdStr)) {
                    System.debug('Skipping split with null playerId');
                    continue;
                }
                
                Object amountSplitObj = split.get('amount');
                if (amountSplitObj == null) {
                    System.debug('Skipping split with null amount for player: ' + playerIdStr);
                    continue;
                }
                
                Decimal splitAmount;
                try {
                    splitAmount = Decimal.valueOf(String.valueOf(amountSplitObj));
                    System.debug('Parsed split amount for player ' + playerIdStr + ': ' + splitAmount);
                } catch (Exception e) {
                    System.debug('Invalid split amount for player ' + playerIdStr + ': ' + amountSplitObj + ' - Error: ' + e.getMessage());
                    continue;
                }
                
                Expense_Split__c expenseSplit = new Expense_Split__c(
                    Expense__c = expense.Id,
                    Player__c = playerIdStr,
                    Amount__c = splitAmount,
                    Percentage__c = split.get('percentage') != null ? 
                        Decimal.valueOf(String.valueOf(split.get('percentage'))) : null,
                    Shares__c = split.get('shares') != null ? 
                        Decimal.valueOf(String.valueOf(split.get('shares'))) : null,
                    Is_Paid__c = playerIdStr.equals(expense.Paid_By__c)
                );
                
                System.debug('Creating expense split: ' + expenseSplit);
                expenseSplits.add(expenseSplit);
            }
            
            if (expenseSplits.isEmpty()) {
                System.debug('No valid expense splits found');
                throw new AuraHandledException('No valid expense splits provided');
            }
            
            System.debug('Inserting ' + expenseSplits.size() + ' expense splits');
            try {
                insert expenseSplits;
                System.debug('Expense splits created successfully');
            } catch (Exception e) {
                System.debug('Error inserting expense splits: ' + e.getMessage());
                throw new AuraHandledException('Failed to create expense splits: ' + e.getMessage());
            }

            // Recalculate group balances
            try {
                System.debug('Recalculating group balances for group: ' + groupId);
                ExpenseCalculationService.calculateGroupBalances(groupId);
                System.debug('Group balances recalculated successfully');
            } catch (Exception e) {
                System.debug('Error recalculating group balances: ' + e.getMessage());
                // Don't throw here as the expense was created successfully
            }

            Map<String, Object> response = new Map<String, Object>();
            response.put('success', true);
            response.put('expenseId', expense.Id);
            response.put('message', 'Expense added successfully');
            
            System.debug('processExpenseCreation completed successfully');
            return JSON.serialize(response);
            
        } catch (Exception e) {
            System.debug('Error in processExpenseCreation: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            
            Map<String, Object> response = new Map<String, Object>();
            response.put('success', false);
            response.put('message', e.getMessage());
            response.put('errorDetails', new Map<String, Object>{
                'stackTrace' => e.getStackTraceString()
            });
            
            return JSON.serialize(response);
        }
    }

@AuraEnabled
public static Map<String, Object> getExpenseDetailsV4(Id expenseId, String sessionToken) {
    try {
        System.debug('getExpenseDetailsV4 called with expenseId: ' + expenseId + ', sessionToken: ' + sessionToken);
        
        // Validate session
        Id playerId = PlayerSessionService.getPlayerFromSession(sessionToken);
        if (playerId == null) {
            System.debug('getExpenseDetailsV4: Invalid session');
            return new Map<String, Object>{
                'success' => false,
                'message' => 'Invalid session'
            };
        }
        
        System.debug('getExpenseDetailsV4: Querying expense with ID: ' + expenseId);
        List<Expense__c> expenses = [SELECT Id, Name, Amount__c, Date__c, Category__c, Notes__c, 
                       Paid_By__c, Split_Method__c, Location__c,
                       (SELECT Id, Player__c, Amount__c, Percentage__c, Shares__c, Is_Paid__c
                        FROM Expense_Split__r)
                FROM Expense__c 
                WHERE Id = :expenseId 
                LIMIT 1];
        
        System.debug('getExpenseDetailsV4: Found ' + expenses.size() + ' expenses');
        
        if (expenses.isEmpty()) {
            System.debug('getExpenseDetailsV4: No expense found');
            return new Map<String, Object>{
                'success' => false,
                'message' => 'Expense not found'
            };
        }
        
        // Convert SObject to Map to avoid serialization issues
        Expense__c expense = expenses[0];
        Map<String, Object> expenseMap = new Map<String, Object>{
            'Id' => expense.Id,
            'Name' => expense.Name,
            'Amount__c' => expense.Amount__c,
            'Date__c' => expense.Date__c,
            'Category__c' => expense.Category__c,
            'Notes__c' => expense.Notes__c,
            'Paid_By__c' => expense.Paid_By__c,
            'Split_Method__c' => expense.Split_Method__c,
            'Location__c' => expense.Location__c
        };
        
        // Convert expense splits to Maps
        List<Map<String, Object>> splitsList = new List<Map<String, Object>>();
        if (expense.Expense_Split__r != null) {
            for (Expense_Split__c split : expense.Expense_Split__r) {
                splitsList.add(new Map<String, Object>{
                    'Id' => split.Id,
                    'Player__c' => split.Player__c,
                    'Amount__c' => split.Amount__c,
                    'Percentage__c' => split.Percentage__c,
                    'Shares__c' => split.Shares__c,
                    'Is_Paid__c' => split.Is_Paid__c
                });
            }
        }
        expenseMap.put('Expense_Split__r', splitsList);
        
        System.debug('getExpenseDetailsV4: Returning expense data');
        return new Map<String, Object>{
            'success' => true,
            'expense' => expenseMap
        };
                
    } catch (Exception e) {
        System.debug('Error in getExpenseDetailsV4: ' + e.getMessage() + '\n' + e.getStackTraceString());
        return new Map<String, Object>{
            'success' => false,
            'message' => 'Error retrieving expense details: ' + e.getMessage()
        };
    }
}

@AuraEnabled(cacheable=true)
public static Expense__c getExpenseForView(Id expenseId) {
    return [
        SELECT Id, Name, Amount__c, Date__c, Category__c, Notes__c, Paid_By__c, Split_Method__c, Location__c,
            (SELECT Id, Player__c, Amount__c, Percentage__c, Shares__c, Is_Paid__c FROM Expense_Split__r)
        FROM Expense__c
        WHERE Id = :expenseId
        LIMIT 1
    ];
}

@AuraEnabled
public static void updateExpense(Expense__c expense, List<Expense_Split__c> splits) {
    update expense;
    // Delete old splits and insert new ones as needed
    delete [SELECT Id FROM Expense_Split__c WHERE Expense__c = :expense.Id];
    insert splits;
}

/**
 * Get security question for a player by email
 * @param email Player's email address
 * @return JSON string with security question or error
 */
@AuraEnabled
public static String getSecurityQuestion(String email) {
    try {
        if (String.isBlank(email)) {
            return createErrorResponse('Email is required');
        }
        List<Player__c> players = [
            SELECT Id, Security_Question__c, Status__c
            FROM Player__c
            WHERE Email__c = :email.toLowerCase().trim()
            AND Status__c = 'Active'
            LIMIT 1
        ];
        if (players.isEmpty()) {
            return createErrorResponse('Player not found or inactive');
        }
        Player__c player = players[0];
        Map<String, Object> response = new Map<String, Object>{
            'success' => true,
            'securityQuestion' => player.Security_Question__c
        };
        return JSON.serialize(response);
    } catch (Exception e) {
        System.debug('Get security question error: ' + e.getMessage());
        return createErrorResponse('Failed to get security question');
    }
}

/**
 * Reset password for a player by email and security answer
 * @param email Player's email address
 * @param securityAnswer Security answer
 * @param newPassword New password
 * @return JSON string with result
 */
@AuraEnabled
public static String resetPassword(String email, String securityAnswer, String newPassword) {
    try {
        if (String.isBlank(email)) {
            return createErrorResponse('Email is required');
        }
        if (String.isBlank(securityAnswer)) {
            return createErrorResponse('Security answer is required');
        }
        if (String.isBlank(newPassword)) {
            return createErrorResponse('New password is required');
        }
        List<Player__c> players = [
            SELECT Id, Security_Answer__c, Status__c
            FROM Player__c
            WHERE Email__c = :email.toLowerCase().trim()
            AND Status__c = 'Active'
            LIMIT 1
        ];
        if (players.isEmpty()) {
            return createErrorResponse('Player not found or inactive');
        }
        Player__c player = players[0];
        if (player.Security_Answer__c != securityAnswer) {
            return createErrorResponse('Incorrect security answer');
        }
        player.Password__c = newPassword;
        update player;
        Map<String, Object> response = new Map<String, Object>{
            'success' => true,
            'message' => 'Password reset successful'
        };
        return JSON.serialize(response);
    } catch (Exception e) {
        System.debug('Reset password error: ' + e.getMessage());
        return createErrorResponse('Failed to reset password');
    }
}
}