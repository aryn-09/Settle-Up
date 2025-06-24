declare module "@salesforce/apex/SettleUpController.loginPlayer" {
  export default function loginPlayer(param: {email: any, password: any, deviceInfo: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.registerPlayer" {
  export default function registerPlayer(param: {name: any, email: any, phone: any, password: any, securityQuestion: any, securityAnswer: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.getPlayerGroups" {
  export default function getPlayerGroups(param: {sessionToken: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.createGroup" {
  export default function createGroup(param: {sessionToken: any, groupName: any, description: any, currencs: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.joinGroup" {
  export default function joinGroup(param: {sessionToken: any, groupCode: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.validateSession" {
  export default function validateSession(param: {sessionToken: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.logoutPlayer" {
  export default function logoutPlayer(param: {sessionToken: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.getMemberBalances" {
  export default function getMemberBalances(param: {sessionToken: any, groupId: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.getOptimalSettlements" {
  export default function getOptimalSettlements(param: {sessionToken: any, groupId: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.createSettlement" {
  export default function createSettlement(param: {sessionToken: any, settlementData: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.confirmSettlement" {
  export default function confirmSettlement(param: {sessionToken: any, settlementId: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.getMemberExpenseHistory" {
  export default function getMemberExpenseHistory(param: {sessionToken: any, memberId: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.getGroupMembers" {
  export default function getGroupMembers(param: {groupId: any, sessionToken: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.getExpenseDetailsV2" {
  export default function getExpenseDetailsV2(param: {expenseId: any, sessionToken: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.removeExpense" {
  export default function removeExpense(param: {sessionToken: any, expenseId: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.getGroupExpenses" {
  export default function getGroupExpenses(param: {groupId: any, sessionToken: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.getExpenseSplitDetails" {
  export default function getExpenseSplitDetails(param: {expenseId: any, sessionToken: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.getGroupDetails" {
  export default function getGroupDetails(param: {sessionToken: any, groupId: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.getGroupSettlements" {
  export default function getGroupSettlements(param: {sessionToken: any, groupId: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.cancelSettlement" {
  export default function cancelSettlement(param: {sessionToken: any, settlementId: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.endSession" {
  export default function endSession(param: {sessionToken: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.getGroupSummary" {
  export default function getGroupSummary(param: {sessionToken: any, groupId: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.getOutstandingBalances" {
  export default function getOutstandingBalances(param: {sessionToken: any, groupId: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.getExpenseDetailsV3" {
  export default function getExpenseDetailsV3(param: {expenseId: any, sessionToken: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.updateExpenseSimple" {
  export default function updateExpenseSimple(param: {sessionToken: any, expenseId: any, expenseData: any, splits: any, groupId: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.saveExpense" {
  export default function saveExpense(param: {requestJson: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.addExpenseV2" {
  export default function addExpenseV2(param: {expenseRequest: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.addExpenseV3" {
  export default function addExpenseV3(param: {groupId: any, sessionToken: any, expenseDataStr: any, splitsStr: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.createExpense" {
  export default function createExpense(param: {groupId: any, sessionToken: any, expenseDataStr: any, splitsStr: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.processExpenseCreation" {
  export default function processExpenseCreation(param: {requestDataJson: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.getExpenseDetailsV4" {
  export default function getExpenseDetailsV4(param: {expenseId: any, sessionToken: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.getExpenseForView" {
  export default function getExpenseForView(param: {expenseId: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.updateExpense" {
  export default function updateExpense(param: {expense: any, splits: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.getSecurityQuestion" {
  export default function getSecurityQuestion(param: {email: any}): Promise<any>;
}
declare module "@salesforce/apex/SettleUpController.resetPassword" {
  export default function resetPassword(param: {email: any, securityAnswer: any, newPassword: any}): Promise<any>;
}
