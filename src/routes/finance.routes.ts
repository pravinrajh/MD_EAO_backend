import { Router } from "express";
import { accountController } from "../controllers/account.controller";
import { budgetController } from "../controllers/budget.controller";
import { financeCategoryController } from "../controllers/financeCategory.controller";
import { financeReportController } from "../controllers/financeReport.controller";
import { financeTransactionController } from "../controllers/financeTransaction.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";
import { validateObjectIdParam } from "../middlewares/objectId.middleware";
import { validate } from "../middlewares/validation.middleware";
import {
  createAccountSchema,
  createBudgetSchema,
  createExpenseSchema,
  createFinanceCategorySchema,
  createIncomeSchema,
  createTransferSchema,
  expensesByCategoryQuerySchema,
  financeSummaryQuerySchema,
  listAccountsQuerySchema,
  listBudgetsQuerySchema,
  listFinanceCategoriesQuerySchema,
  listTransactionsQuerySchema,
  monthlyReportQuerySchema,
  updateAccountSchema,
  updateBudgetSchema,
  updateFinanceCategorySchema,
  updateTransactionStatusSchema,
} from "../validations/finance.validation";

const router = Router();

router.use(authenticate);

router.get("/accounts", validate(listAccountsQuerySchema, "query"), accountController.list);
router.post("/accounts", authorize("MD", "ADMIN"), validate(createAccountSchema), accountController.create);
router.get("/accounts/:id", validateObjectIdParam, accountController.getById);
router.patch(
  "/accounts/:id",
  authorize("MD", "ADMIN"),
  validateObjectIdParam,
  validate(updateAccountSchema),
  accountController.update,
);

router.get("/categories", validate(listFinanceCategoriesQuerySchema, "query"), financeCategoryController.list);
router.post(
  "/categories",
  authorize("MD", "ADMIN"),
  validate(createFinanceCategorySchema),
  financeCategoryController.create,
);
router.get("/categories/:id", validateObjectIdParam, financeCategoryController.getById);
router.patch(
  "/categories/:id",
  authorize("MD", "ADMIN"),
  validateObjectIdParam,
  validate(updateFinanceCategorySchema),
  financeCategoryController.update,
);
router.delete(
  "/categories/:id",
  authorize("MD", "ADMIN"),
  validateObjectIdParam,
  financeCategoryController.remove,
);

router.get("/summary", validate(financeSummaryQuerySchema, "query"), financeReportController.summary);
router.get("/reports/monthly", validate(monthlyReportQuerySchema, "query"), financeReportController.monthly);
router.get(
  "/reports/expenses-by-category",
  validate(expensesByCategoryQuerySchema, "query"),
  financeReportController.expensesByCategory,
);
router.get("/projects/:id/summary", validateObjectIdParam, financeReportController.projectSummary);
router.get("/customers/:id/summary", validateObjectIdParam, financeReportController.customerSummary);

router.get("/budgets", validate(listBudgetsQuerySchema, "query"), budgetController.list);
router.post("/budgets", validate(createBudgetSchema), budgetController.create);
router.get("/budgets/:id/summary", validateObjectIdParam, budgetController.summary);
router.get("/budgets/:id", validateObjectIdParam, budgetController.getById);
router.patch("/budgets/:id", validateObjectIdParam, validate(updateBudgetSchema), budgetController.update);
router.delete("/budgets/:id", validateObjectIdParam, budgetController.remove);

router.post("/transactions/income", validate(createIncomeSchema), financeTransactionController.createIncome);
router.post("/transactions/expense", validate(createExpenseSchema), financeTransactionController.createExpense);
router.post(
  "/transactions/transfer",
  authorize("MD", "ADMIN"),
  validate(createTransferSchema),
  financeTransactionController.createTransfer,
);
router.get("/transactions", validate(listTransactionsQuerySchema, "query"), financeTransactionController.list);
router.patch(
  "/transactions/:id/status",
  validateObjectIdParam,
  validate(updateTransactionStatusSchema),
  financeTransactionController.updateStatus,
);
router.get("/transactions/:id", validateObjectIdParam, financeTransactionController.getById);

export default router;
