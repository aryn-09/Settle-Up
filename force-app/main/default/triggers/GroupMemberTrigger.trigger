trigger GroupMemberTrigger on Group_Member__c (after insert, after update, after delete, after undelete) {
    Set<Id> groupIds = new Set<Id>();
    
    // Collect group IDs from inserted/updated records
    if (Trigger.isInsert || Trigger.isUpdate || Trigger.isUndelete) {
        for (Group_Member__c gm : Trigger.new) {
            if (gm.Group__c != null) {
                groupIds.add(gm.Group__c);
            }
        }
    }
    // Collect group IDs from deleted records
    if (Trigger.isDelete) {
        for (Group_Member__c gm : Trigger.old) {
            if (gm.Group__c != null) {
                groupIds.add(gm.Group__c);
            }
        }
    }
    
    if (!groupIds.isEmpty()) {
        List<Group__c> groupsToUpdate = new List<Group__c>();
        for (Id groupId : groupIds) {
            Integer memberCount = [
                SELECT COUNT() FROM Group_Member__c 
                WHERE Group__c = :groupId AND Status__c = 'Active'
            ];
            groupsToUpdate.add(new Group__c(
                Id = groupId,
                Member_Count__c = memberCount,
                Last_Activity__c = System.now()
            ));
        }
        if (!groupsToUpdate.isEmpty()) {
            update groupsToUpdate;
        }
    }
}