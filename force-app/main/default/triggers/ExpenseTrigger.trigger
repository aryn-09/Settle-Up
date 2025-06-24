trigger ExpenseTrigger on Expense__c (after insert, after update, after delete, after undelete) {
    if (Trigger.isInsert || Trigger.isUpdate || Trigger.isUndelete) {
        ExpenseTriggerHandler.updateGroupTotals(Trigger.newMap.keySet());
    }
    if (Trigger.isDelete) {
        ExpenseTriggerHandler.updateGroupTotals(Trigger.oldMap.keySet());
    }
}