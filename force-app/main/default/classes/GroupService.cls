public with sharing class GroupService {
    
    /**
     * Create a new group
     * @param groupName Name of the group
     * @param description Group description
     * @param creatorId Player ID who is creating the group
     * @param currency Group currency
     * @return Group ID
     */
    public static Id createGroup(String groupName, String description, Id creatorId, String currencs) {
        System.debug('createGroup called with groupName: ' + groupName + ', description: ' + description + ', creatorId: ' + creatorId + ', currencs: ' + currencs);
        try {
            // Create group record
            Group__c groupi = new Group__c(
                Name = groupName,
                Description__c = description,
                Currency__c = currencs != null ? currencs : 'USD',
                Group_Code__c = generateUniqueGroupCode(),
                Created_Date__c = Date.today(),
                Last_Activity__c = DateTime.now(),
                Status__c = 'Active',
                Total_Expenses__c = 0,
                Member_Count__c = 1
            );
            System.debug('Inserting group: ' + groupi);
            insert groupi;
            System.debug('Inserted group with Id: ' + groupi.Id);
            
            // Add creator as admin member
            Group_Member__c creatorMember = new Group_Member__c(
                Group__c = groupi.Id,
                Player__c = creatorId,
                Role__c = 'Admin',
                Status__c = 'Active',
                Total_Paid__c = 0,
                Total_Owed__c = 0,
                Net_Balance__c = 0
            );
            System.debug('Inserting creator member: ' + creatorMember);
            insert creatorMember;
            System.debug('Inserted creator member with Id: ' + creatorMember.Id);
            
            return groupi.Id;
            
        } catch (Exception e) {
            System.debug('Create group error: ' + e.getMessage() + ' | StackTrace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to create group: ' + e.getMessage());
        }
    }
    
    /**
     * Get group by group code
     * @param groupCode Unique group code
     * @return Group record if found, null otherwise
     */
    public static Group__c getGroupByCode(String groupCode) {
        try {
            List<Group__c> groups = [
                SELECT Id, Name, Description__c, Currency__c, Group_Code__c, 
                       Status__c, Member_Count__c, Total_Expenses__c
                FROM Group__c 
                WHERE Group_Code__c = :groupCode
                AND Status__c = 'Active'
                LIMIT 1
            ];
            
            return groups.isEmpty() ? null : groups[0];
            
        } catch (Exception e) {
            System.debug('Get group by code error: ' + e.getMessage());
            return null;
        }
    }
    
    /**
     * Add a player to a group
     * @param groupId Group ID
     * @param playerId Player ID to add
     * @param role Role in the group (Admin, Member)
     */
    public static void addMemberToGroup(Id groupId, Id playerId, String role) {
        try {
            // Check if player is already a member
            List<Group_Member__c> existingMembers = [
                SELECT Id, Status__c 
                FROM Group_Member__c 
                WHERE Group__c = :groupId 
                AND Player__c = :playerId
                LIMIT 1
            ];
            
            if (!existingMembers.isEmpty()) {
                if (existingMembers[0].Status__c == 'Active') {
                    throw new AuraHandledException('Player is already a member of this group');
                } else {
                    // Reactivate membership
                    existingMembers[0].Status__c = 'Active';
                    update existingMembers[0];
                    return;
                }
            }
            
            // Create new membership
            Group_Member__c newMember = new Group_Member__c(
                Group__c = groupId,
                Player__c = playerId,
                Role__c = role != null ? role : 'Member',
                Status__c = 'Active',
                Total_Paid__c = 0,
                Total_Owed__c = 0
                // Net_Balance__c is calculated dynamically, no need to initialize
            );
            
            insert newMember;
            
            // Update group member count
            updateGroupMemberCount(groupId);
            
        } catch (Exception e) {
            System.debug('Add member to group error: ' + e.getMessage());
            throw new AuraHandledException('Failed to add member to group: ' + e.getMessage());
        }
    }
    
    /**
     * Remove a player from a group
     * @param groupId Group ID
     * @param playerId Player ID to remove
     */
    public static void removeMemberFromGroup(Id groupId, Id playerId) {
        try {
            List<Group_Member__c> members = [
                SELECT Id, Role__c
                FROM Group_Member__c 
                WHERE Group__c = :groupId 
                AND Player__c = :playerId
                AND Status__c = 'Active'
                LIMIT 1
            ];
            
            if (members.isEmpty()) {
                throw new AuraHandledException('Player is not a member of this group');
            }
            
            Group_Member__c member = members[0];
            
            // Check if member has outstanding balance using outstanding balance calculation
            Decimal outstandingBalance = ExpenseCalculationService.calculateOutstandingBalance(member);
            if (Math.abs(outstandingBalance) > 0.01) {
                throw new AuraHandledException('Cannot remove member with outstanding balance of ' + outstandingBalance.setScale(2));
            }
            
            // Check if trying to remove the last admin
            if (member.Role__c == 'Admin') {
                List<Group_Member__c> admins = [
                    SELECT Id 
                    FROM Group_Member__c 
                    WHERE Group__c = :groupId 
                    AND Role__c = 'Admin'
                    AND Status__c = 'Active'
                ];
                
                if (admins.size() <= 1) {
                    throw new AuraHandledException('Cannot remove the last admin from the group');
                }
            }
            
            // Deactivate membership
            member.Status__c = 'Inactive';
            update member;
            
            // Update group member count
            updateGroupMemberCount(groupId);
            
        } catch (Exception e) {
            System.debug('Remove member from group error: ' + e.getMessage());
            throw new AuraHandledException('Failed to remove member from group: ' + e.getMessage());
        }
    }
    
    /**
     * Update group member count
     * @param groupId Group ID
     */
    private static void updateGroupMemberCount(Id groupId) {
        try {
            Integer memberCount = [
                SELECT COUNT() 
                FROM Group_Member__c 
                WHERE Group__c = :groupId 
                AND Status__c = 'Active'
            ];
            
            Group__c groupi = new Group__c(
                Id = groupId,
                Member_Count__c = memberCount,
                Last_Activity__c = DateTime.now()
            );
            
            update groupi;
            
        } catch (Exception e) {
            System.debug('Update member count error: ' + e.getMessage());
        }
    }
    
    /**
     * Generate unique group code
     * @return Unique group code
     */
    private static String generateUniqueGroupCode() {
        String characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        String groupCode;
        Boolean isUnique = false;
        Integer attempts = 0;
        
        do {
            groupCode = '';
            for (Integer i = 0; i < 6; i++) {
                Integer randomIndex = Math.mod(Math.abs(Crypto.getRandomInteger()), characters.length());
                groupCode += characters.substring(randomIndex, randomIndex + 1);
            }
            
            // Check if code is unique
            List<Group__c> existingGroups = [
                SELECT Id 
                FROM Group__c 
                WHERE Group_Code__c = :groupCode
                LIMIT 1
            ];
            
            isUnique = existingGroups.isEmpty();
            attempts++;
            
        } while (!isUnique && attempts < 10);
        
        if (!isUnique) {
            // Fallback to timestamp-based code
            groupCode = 'GRP' + String.valueOf(DateTime.now().getTime()).right(6);
        }
        
        return groupCode;
    }
}