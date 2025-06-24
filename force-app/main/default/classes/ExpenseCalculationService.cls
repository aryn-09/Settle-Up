/**
 * @description Service class for handling expense calculations, balance computations, and settlement optimizations
 * @author Settle Up Application
 * @date 2025
 */
public with sharing class ExpenseCalculationService {
    
    /**
     * @description Calculate net balances for all active members in a group
     * @param groupId The ID of the group to calculate balances for
     */
    public static void calculateGroupBalances(Id groupId) {
        try {
            List<Group_Member__c> members = [
                SELECT Id, Player__c, Total_Paid__c, Total_Owed__c 
                FROM Group_Member__c 
                WHERE Group__c = :groupId AND Status__c = 'Active'
            ];
            
            List<Group_Member__c> membersToUpdate = new List<Group_Member__c>();
            
            for (Group_Member__c member : members) {
                Group_Member__c updatedMember = calculateMemberBalance(member);
                if (updatedMember != null) {
                    membersToUpdate.add(updatedMember);
                }
            }
            
            if (!membersToUpdate.isEmpty()) {
                update membersToUpdate;
            }
            
        } catch (Exception e) {
            System.debug('Error calculating group balances: ' + e.getMessage());
            throw new ExpenseCalculationException('Failed to calculate group balances: ' + e.getMessage());
        }
    }
    
    /**
     * @description Calculate individual member balance based on expenses paid and owed
     * @param member The Group_Member__c record to calculate balance for
     * @return Updated Group_Member__c record with calculated balances
     */
    public static Group_Member__c calculateMemberBalance(Group_Member__c member) {
        try {
            // First get the group ID for this member
            Group_Member__c memberWithGroup = [
                SELECT Id, Group__c, Player__c 
                FROM Group_Member__c 
                WHERE Id = :member.Id 
                LIMIT 1
            ];
            
            // Calculate total amount paid by this member in this group
            AggregateResult[] paidResults = [
                SELECT SUM(Amount__c) totalPaid
                FROM Expense__c 
                WHERE Group__c = :memberWithGroup.Group__c
                AND Paid_By__c = :memberWithGroup.Player__c
                AND Status__c = 'Active'
            ];
            
            Decimal totalPaid = (Decimal)paidResults[0].get('totalPaid');
            if (totalPaid == null) totalPaid = 0;
            
            // Get expense IDs in this group
            List<Id> expenseIds = new List<Id>();
            for (Expense__c exp : [SELECT Id FROM Expense__c WHERE Group__c = :memberWithGroup.Group__c AND Status__c = 'Active']) {
                expenseIds.add(exp.Id);
            }
            
            // Calculate total amount owed by this member
            Decimal totalOwed = 0;
            if (!expenseIds.isEmpty()) {
                AggregateResult[] owedResults = [
                    SELECT SUM(Amount__c) totalOwed
                    FROM Expense_Split__c 
                    WHERE Player__c = :memberWithGroup.Player__c
                    AND Expense__c IN :expenseIds
                ];
                
                totalOwed = (Decimal)owedResults[0].get('totalOwed');
                if (totalOwed == null) totalOwed = 0;
            }
            
            // Update member record with calculated values
            member.Total_Paid__c = totalPaid;
            member.Total_Owed__c = totalOwed;

            // Calculate settlements (confirmed only)
            Decimal totalSettledPaid = 0;
            Decimal totalSettledReceived = 0;
            List<AggregateResult> paidSettlements = [
                SELECT SUM(Amount__c) totalPaid
                FROM Settlement__c
                WHERE Group__c = :memberWithGroup.Group__c
                AND From_Player__c = :memberWithGroup.Player__c
                AND Status__c = 'Confirmed'
            ];
            if (!paidSettlements.isEmpty() && paidSettlements[0].get('totalPaid') != null) {
                totalSettledPaid = (Decimal)paidSettlements[0].get('totalPaid');
            }
            List<AggregateResult> receivedSettlements = [
                SELECT SUM(Amount__c) totalReceived
                FROM Settlement__c
                WHERE Group__c = :memberWithGroup.Group__c
                AND To_Player__c = :memberWithGroup.Player__c
                AND Status__c = 'Confirmed'
            ];
            if (!receivedSettlements.isEmpty() && receivedSettlements[0].get('totalReceived') != null) {
                totalSettledReceived = (Decimal)receivedSettlements[0].get('totalReceived');
            }

            member.Net_Balance__c = (totalPaid - totalOwed) + totalSettledPaid - totalSettledReceived;
            return member;
            
        } catch (Exception e) {
            System.debug('Error calculating member balance: ' + e.getMessage());
            return null;
        }
    }
    
    /**
     * @description Split expense equally among selected players
     * @param expenseId The ID of the expense to split
     * @param playerIds List of player IDs to split the expense among
     */
    public static void splitExpenseEqually(Id expenseId, List<Id> playerIds) {
        if (playerIds == null || playerIds.isEmpty()) {
            throw new ExpenseCalculationException('No players selected for expense split');
        }
        
        try {
            Expense__c expense = [SELECT Id, Amount__c FROM Expense__c WHERE Id = :expenseId LIMIT 1];
            
            Decimal splitAmount = expense.Amount__c.divide(playerIds.size(), 2, System.RoundingMode.HALF_UP);
            Decimal splitPercentage = (100.0 / playerIds.size()).setScale(2, System.RoundingMode.HALF_UP);
            
            List<Expense_Split__c> splits = new List<Expense_Split__c>();
            
            for (Id playerId : playerIds) {
                splits.add(new Expense_Split__c(
                    Expense__c = expenseId,
                    Player__c = playerId,
                    Amount__c = splitAmount,
                    Percentage__c = splitPercentage,
                    Shares__c = 1,
                    Is_Paid__c = false
                ));
            }
            
            insert splits;
            
        } catch (Exception e) {
            System.debug('Error splitting expense equally: ' + e.getMessage());
            throw new ExpenseCalculationException('Failed to split expense: ' + e.getMessage());
        }
    }
    
    /**
     * @description Split expense by custom percentages
     * @param expenseId The ID of the expense to split
     * @param playerPercentages Map of Player ID to percentage (should total 100)
     */
    public static void splitExpenseByPercentage(Id expenseId, Map<Id, Decimal> playerPercentages) {
        if (playerPercentages == null || playerPercentages.isEmpty()) {
            throw new ExpenseCalculationException('No percentage splits provided');
        }
        
        // Validate percentages total to 100
        Decimal totalPercentage = 0;
        for (Decimal percentage : playerPercentages.values()) {
            totalPercentage += percentage;
        }
        
        if (Math.abs(totalPercentage - 100) > 0.01) {
            throw new ExpenseCalculationException('Percentages must total 100%');
        }
        
        try {
            Expense__c expense = [SELECT Id, Amount__c FROM Expense__c WHERE Id = :expenseId LIMIT 1];
            
            List<Expense_Split__c> splits = new List<Expense_Split__c>();
            
            for (Id playerId : playerPercentages.keySet()) {
                Decimal percentage = playerPercentages.get(playerId);
                Decimal splitAmount = (expense.Amount__c * percentage / 100).setScale(2, System.RoundingMode.HALF_UP);
                
                splits.add(new Expense_Split__c(
                    Expense__c = expenseId,
                    Player__c = playerId,
                    Amount__c = splitAmount,
                    Percentage__c = percentage,
                    Is_Paid__c = false
                ));
            }
            
            insert splits;
            
        } catch (Exception e) {
            System.debug('Error splitting expense by percentage: ' + e.getMessage());
            throw new ExpenseCalculationException('Failed to split expense by percentage: ' + e.getMessage());
        }
    }
    
    /**
     * @description Split expense by custom amounts
     * @param expenseId The ID of the expense to split
     * @param playerAmounts Map of Player ID to amount (should total expense amount)
     */
    public static void splitExpenseByAmount(Id expenseId, Map<Id, Decimal> playerAmounts) {
        if (playerAmounts == null || playerAmounts.isEmpty()) {
            throw new ExpenseCalculationException('No amount splits provided');
        }
        
        try {
            Expense__c expense = [SELECT Id, Amount__c FROM Expense__c WHERE Id = :expenseId LIMIT 1];
            
            // Validate amounts total to expense amount
            Decimal totalAmount = 0;
            for (Decimal amount : playerAmounts.values()) {
                totalAmount += amount;
            }
            
            if (Math.abs(totalAmount - expense.Amount__c) > 0.01) {
                throw new ExpenseCalculationException('Split amounts must total expense amount');
            }
            
            List<Expense_Split__c> splits = new List<Expense_Split__c>();
            
            for (Id playerId : playerAmounts.keySet()) {
                Decimal amount = playerAmounts.get(playerId);
                Decimal percentage = (amount / expense.Amount__c * 100).setScale(2, System.RoundingMode.HALF_UP);
                
                splits.add(new Expense_Split__c(
                    Expense__c = expenseId,
                    Player__c = playerId,
                    Amount__c = amount,
                    Percentage__c = percentage,
                    Is_Paid__c = false
                ));
            }
            
            insert splits;
            
        } catch (Exception e) {
            System.debug('Error splitting expense by amount: ' + e.getMessage());
            throw new ExpenseCalculationException('Failed to split expense by amount: ' + e.getMessage());
        }
    }
    
    /**
     * @description Calculate outstanding balance for a member (what's still owed after settlements)
     * @param member The Group_Member__c record to calculate outstanding balance for
     * @return Outstanding balance (positive = owed money, negative = owes money)
     */
    public static Decimal calculateOutstandingBalance(Group_Member__c member) {
        try {
            // First get the group ID for this member
            Group_Member__c memberWithGroup = [
                SELECT Id, Group__c, Player__c 
                FROM Group_Member__c 
                WHERE Id = :member.Id 
                LIMIT 1
            ];
            
            // Calculate total amount paid by this member in this group
            AggregateResult[] paidResults = [
                SELECT SUM(Amount__c) totalPaid
                FROM Expense__c 
                WHERE Group__c = :memberWithGroup.Group__c
                AND Paid_By__c = :memberWithGroup.Player__c
                AND Status__c = 'Active'
            ];
            
            Decimal totalPaid = (Decimal)paidResults[0].get('totalPaid');
            if (totalPaid == null) totalPaid = 0;
            
            // Get expense IDs in this group
            List<Id> expenseIds = new List<Id>();
            for (Expense__c exp : [SELECT Id FROM Expense__c WHERE Group__c = :memberWithGroup.Group__c AND Status__c = 'Active']) {
                expenseIds.add(exp.Id);
            }
            
            // Calculate total amount owed by this member
            Decimal totalOwed = 0;
            if (!expenseIds.isEmpty()) {
                AggregateResult[] owedResults = [
                    SELECT SUM(Amount__c) totalOwed
                    FROM Expense_Split__c 
                    WHERE Player__c = :memberWithGroup.Player__c
                    AND Expense__c IN :expenseIds
                ];
                
                totalOwed = (Decimal)owedResults[0].get('totalOwed');
                if (totalOwed == null) totalOwed = 0;
            }
            
            // Calculate settlements (confirmed only)
            Decimal totalSettledPaid = 0;
            Decimal totalSettledReceived = 0;
            List<AggregateResult> paidSettlements = [
                SELECT SUM(Amount__c) totalPaid
                FROM Settlement__c
                WHERE Group__c = :memberWithGroup.Group__c
                AND From_Player__c = :memberWithGroup.Player__c
                AND Status__c = 'Confirmed'
            ];
            if (!paidSettlements.isEmpty() && paidSettlements[0].get('totalPaid') != null) {
                totalSettledPaid = (Decimal)paidSettlements[0].get('totalPaid');
            }
            List<AggregateResult> receivedSettlements = [
                SELECT SUM(Amount__c) totalReceived
                FROM Settlement__c
                WHERE Group__c = :memberWithGroup.Group__c
                AND To_Player__c = :memberWithGroup.Player__c
                AND Status__c = 'Confirmed'
            ];
            if (!receivedSettlements.isEmpty() && receivedSettlements[0].get('totalReceived') != null) {
                totalSettledReceived = (Decimal)receivedSettlements[0].get('totalReceived');
            }

            // Outstanding balance = (totalPaid - totalOwed) + settlements paid - settlements received
            // Positive = this person is owed money
            // Negative = this person owes money
            return (totalPaid - totalOwed) + totalSettledPaid - totalSettledReceived;
            
        } catch (Exception e) {
            System.debug('Error calculating outstanding balance: ' + e.getMessage());
            return 0;
        }
    }
    
    /**
     * @description Calculate optimal settlements to minimize number of transactions
     * Uses improved debt simplification algorithm to reduce complexity
     * @param groupId The ID of the group to calculate settlements for
     * @return List of optimal Settlement__c records (not yet inserted)
     */
    public static List<Settlement__c> calculateOptimalSettlements(Id groupId) {
        try {
            // Get all group members with their outstanding balances (not net balances)
            List<Group_Member__c> members = [
                SELECT Id, Player__c, Player__r.Name
                FROM Group_Member__c 
                WHERE Group__c = :groupId 
                AND Status__c = 'Active'
                ORDER BY Player__r.Name
            ];
            
            if (members.isEmpty()) {
                return new List<Settlement__c>();
            }
            
            List<Settlement__c> settlements = new List<Settlement__c>();
            
            // Calculate outstanding balances for each member
            List<BalanceInfo> creditors = new List<BalanceInfo>();
            List<BalanceInfo> debtors = new List<BalanceInfo>();
            
            for (Group_Member__c member : members) {
                Decimal outstandingBalance = calculateOutstandingBalance(member);
                
                // Only include members with non-zero outstanding balances
                if (Math.abs(outstandingBalance) > 0.01) {
                    BalanceInfo balance = new BalanceInfo();
                    balance.playerId = member.Player__c;
                    balance.playerName = member.Player__r.Name;
                    balance.amount = Math.abs(outstandingBalance);
                    balance.originalBalance = outstandingBalance;
                    
                    if (outstandingBalance > 0) {
                        // This person is owed money (creditor)
                        creditors.add(balance);
                    } else {
                        // This person owes money (debtor)
                        debtors.add(balance);
                    }
                }
            }
            
            // Sort creditors by amount (descending) and debtors by amount (descending)
            creditors.sort(new BalanceInfoComparator());
            debtors.sort(new BalanceInfoComparator());
            
            // Use improved algorithm: match largest creditors with largest debtors
            Integer creditorIndex = 0;
            Integer debtorIndex = 0;
            
            while (creditorIndex < creditors.size() && debtorIndex < debtors.size()) {
                BalanceInfo creditor = creditors[creditorIndex];
                BalanceInfo debtor = debtors[debtorIndex];
                
                // Calculate settlement amount (minimum of what creditor is owed and what debtor owes)
                Decimal settlementAmount = Math.min(creditor.amount, debtor.amount);
                
                // Only create settlement if amount is significant (> 0.01)
                if (settlementAmount > 0.01) {
                    // Create settlement record
                    Settlement__c settlement = new Settlement__c(
                        Group__c = groupId,
                        From_Player__c = debtor.playerId,
                        To_Player__c = creditor.playerId,
                        Amount__c = settlementAmount.setScale(2, System.RoundingMode.HALF_UP),
                        Date__c = Date.today(),
                        Status__c = 'Pending',
                        Notes__c = 'Suggested settlement: ' + debtor.playerName + ' pays ' + creditor.playerName
                    );
                    settlements.add(settlement);
                    
                    // Update remaining amounts
                    creditor.amount -= settlementAmount;
                    debtor.amount -= settlementAmount;
                }
                
                // Move to next creditor/debtor if current one is fully settled
                if (creditor.amount <= 0.01) {
                    creditorIndex++;
                }
                if (debtor.amount <= 0.01) {
                    debtorIndex++;
                }
            }
            
            return settlements;
            
        } catch (Exception e) {
            System.debug('Error calculating optimal settlements: ' + e.getMessage());
            throw new ExpenseCalculationException('Failed to calculate settlements: ' + e.getMessage());
        }
    }
    
    /**
     * @description Get detailed settlement analysis for a group
     * @param groupId The ID of the group
     * @return Map with detailed settlement analysis
     */
    public static Map<String, Object> getSettlementAnalysis(Id groupId) {
        try {
            // Get all group members
            List<Group_Member__c> members = [
                SELECT Id, Player__c, Player__r.Name, Total_Paid__c, Total_Owed__c
                FROM Group_Member__c 
                WHERE Group__c = :groupId 
                AND Status__c = 'Active'
                ORDER BY Player__r.Name
            ];
            
            List<Map<String, Object>> creditors = new List<Map<String, Object>>();
            List<Map<String, Object>> debtors = new List<Map<String, Object>>();
            Decimal totalDebt = 0;
            Decimal totalCredit = 0;
            
            for (Group_Member__c member : members) {
                // Calculate outstanding balance for this member
                Decimal outstandingBalance = calculateOutstandingBalance(member);
                
                if (outstandingBalance > 0.01) {
                    // This person is owed money (creditor)
                    creditors.add(new Map<String, Object>{
                        'playerId' => member.Player__c,
                        'playerName' => member.Player__r.Name,
                        'amount' => outstandingBalance,
                        'totalPaid' => member.Total_Paid__c,
                        'totalOwed' => member.Total_Owed__c,
                        'outstandingBalance' => outstandingBalance
                    });
                    totalCredit += outstandingBalance;
                } else if (outstandingBalance < -0.01) {
                    // This person owes money (debtor)
                    debtors.add(new Map<String, Object>{
                        'playerId' => member.Player__c,
                        'playerName' => member.Player__r.Name,
                        'amount' => Math.abs(outstandingBalance),
                        'totalPaid' => member.Total_Paid__c,
                        'totalOwed' => member.Total_Owed__c,
                        'outstandingBalance' => outstandingBalance
                    });
                    totalDebt += Math.abs(outstandingBalance);
                }
            }
            
            // Calculate optimal settlements based on outstanding balances
            List<Settlement__c> optimalSettlements = calculateOptimalSettlements(groupId);
            List<Map<String, Object>> settlementDetails = new List<Map<String, Object>>();
            
            for (Settlement__c settlement : optimalSettlements) {
                settlementDetails.add(new Map<String, Object>{
                    'fromPlayerId' => settlement.From_Player__c,
                    'toPlayerId' => settlement.To_Player__c,
                    'amount' => settlement.Amount__c,
                    'description' => 'Settlement from ' + settlement.From_Player__r?.Name + ' to ' + settlement.To_Player__r?.Name
                });
            }
            
            return new Map<String, Object>{
                'creditors' => creditors,
                'debtors' => debtors,
                'totalDebt' => totalDebt,
                'totalCredit' => totalCredit,
                'optimalSettlements' => settlementDetails,
                'settlementCount' => optimalSettlements.size(),
                'isBalanced' => Math.abs(totalDebt - totalCredit) < 0.01
            };
            
        } catch (Exception e) {
            System.debug('Error getting settlement analysis: ' + e.getMessage());
            throw new ExpenseCalculationException('Failed to get settlement analysis: ' + e.getMessage());
        }
    }
    
    /**
     * @description Get balance summary for a group
     * @param groupId The ID of the group
     * @return Map with balance summary information
     */
    public static Map<String, Object> getGroupBalanceSummary(Id groupId) {
        try {
            List<Group_Member__c> members = [
                SELECT Id, Player__c, Player__r.Name, Total_Paid__c, Total_Owed__c
                FROM Group_Member__c 
                WHERE Group__c = :groupId 
                AND Status__c = 'Active'
            ];
            
            Decimal totalGroupExpenses = 0;
            Decimal totalOwed = 0;
            Decimal totalPaid = 0;
            Integer membersInDebt = 0;
            Integer membersOwed = 0;
            
            List<Map<String, Object>> memberBalances = new List<Map<String, Object>>();
            
            for (Group_Member__c member : members) {
                // Calculate outstanding balance for this member
                Decimal outstandingBalance = calculateOutstandingBalance(member);
                
                totalPaid += (member.Total_Paid__c != null ? member.Total_Paid__c : 0);
                totalOwed += (member.Total_Owed__c != null ? member.Total_Owed__c : 0);
                
                if (outstandingBalance > 0.01) {
                    membersOwed++;
                } else if (outstandingBalance < -0.01) {
                    membersInDebt++;
                }
                
                memberBalances.add(new Map<String, Object>{
                    'playerId' => member.Player__c,
                    'playerName' => member.Player__r.Name,
                    'netBalance' => outstandingBalance,
                    'totalPaid' => member.Total_Paid__c,
                    'totalOwed' => member.Total_Owed__c
                });
            }
            
            return new Map<String, Object>{
                'totalGroupExpenses' => totalPaid,
                'membersInDebt' => membersInDebt,
                'membersOwed' => membersOwed,
                'memberBalances' => memberBalances,
                'isGroupSettled' => (membersInDebt == 0 && membersOwed == 0)
            };
            
        } catch (Exception e) {
            System.debug('Error getting group balance summary: ' + e.getMessage());
            throw new ExpenseCalculationException('Failed to get balance summary: ' + e.getMessage());
        }
    }
    
    /**
     * @description Helper class for balance calculations
     */
    private class BalanceInfo {
        public Id playerId;
        public String playerName;
        public Decimal amount;
        public Decimal originalBalance;
    }
    
    /**
     * @description Comparator for sorting balance info by amount (descending)
     */
    private class BalanceInfoComparator implements Comparator<BalanceInfo> {
        public Integer compare(BalanceInfo a, BalanceInfo b) {
            if (a.amount > b.amount) return -1;
            if (a.amount < b.amount) return 1;
            return 0;
        }
    }
    
    /**
     * @description Custom exception for expense calculation errors
     */
    public class ExpenseCalculationException extends Exception {}
}