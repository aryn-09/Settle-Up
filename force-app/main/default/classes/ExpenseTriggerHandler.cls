public with sharing class ExpenseTriggerHandler {
    public static void updateGroupTotals(Set<Id> expenseIds) {
        // Get all affected group IDs
        Set<Id> groupIds = new Set<Id>();
        for (Expense__c exp : [SELECT Id, Group__c FROM Expense__c WHERE Id IN :expenseIds]) {
            if (exp.Group__c != null) {
                groupIds.add(exp.Group__c);
            }
        }
        if (groupIds.isEmpty()) return;

        // Query and sum all active expenses for each group
        Map<Id, Decimal> groupTotals = new Map<Id, Decimal>();
        for (AggregateResult ar : [SELECT Group__c groupId, SUM(Amount__c) total FROM Expense__c WHERE Group__c IN :groupIds AND Status__c = 'Active' GROUP BY Group__c]) {
            groupTotals.put((Id)ar.get('groupId'), (Decimal)ar.get('total'));
        }

        // Prepare updates
        List<Group__c> groupsToUpdate = new List<Group__c>();
        for (Id groupId : groupIds) {
            Group__c groupi = new Group__c(Id = groupId);
            groupi.Total_Expenses__c = groupTotals.containsKey(groupId) ? groupTotals.get(groupId) : 0;
            groupsToUpdate.add(groupi);
        }
        if (!groupsToUpdate.isEmpty()) {
            update groupsToUpdate;
        }
    }
}