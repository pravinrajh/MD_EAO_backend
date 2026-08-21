import { env } from "../../config/env";
import { ASSISTANT_LIST_LIMIT } from "../../utils/constants";
import type { AssistantIntent } from "../../utils/constants";
import type { AssistantSource, FormattedAssistantAnswer } from "./types";

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function formatInr(amount: number): string {
  return `₹${Math.trunc(amount).toLocaleString("en-IN")}`;
}

function trimDecimal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

export function formatInrCompact(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  if (abs >= 10_000_000) return `${sign}₹${trimDecimal(abs / 10_000_000)} Cr`;
  if (abs >= 100_000) return `${sign}₹${trimDecimal(abs / 100_000)}L`;
  return `${sign}${formatInr(abs)}`;
}

function formatTime(value: unknown): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: env.APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function showingNote(count: number, showing: number): string {
  if (count > showing && showing > 0) return ` Showing the first ${showing} of ${count}.`;
  return "";
}

function meetingLines(meetings: unknown[]): string {
  const lines = meetings.slice(0, ASSISTANT_LIST_LIMIT).map((raw) => {
    const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const time = formatTime(item.startTime);
    return time ? `${time} — ${asString(item.title, "Meeting")}` : asString(item.title, "Meeting");
  });
  return lines.length > 0 ? `\n${lines.join("\n")}` : "";
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function healthPhrase(health: unknown): string {
  const value = String(health ?? "");
  if (value === "CRITICAL") return "critical";
  if (value === "AT_RISK") return "at risk";
  return "healthy";
}

function formatPending(data: Record<string, unknown>): string {
  const count = asNumber(data.count);
  const high = asNumber(data.highPriority);
  if (count === 0) return "You currently have no pending tasks.";
  const highPart = high > 0 ? `, including ${plural(high, "high-priority task")}` : "";
  return `You have ${plural(count, "pending task")}${highPart}.${showingNote(count, asNumber(data.showing) || (data.tasks as unknown[] | undefined)?.length || 0)}`;
}

function formatOverdue(data: Record<string, unknown>): string {
  const count = asNumber(data.count);
  const high = asNumber(data.highPriority);
  if (count === 0) return "You currently have no overdue tasks.";
  const highPart = high > 0 ? ` ${plural(high, "high-priority task")} ${high === 1 ? "is" : "are"} overdue.` : "";
  return `You have ${plural(count, "overdue task")}.${highPart}${showingNote(count, asNumber(data.showing))}`;
}

function formatProject(data: Record<string, unknown>, kind: "status" | "health"): string {
  const name = asString(data.name, "The project");
  const health = healthPhrase(data.health);
  const progress = asNumber(data.progress);
  const overdue = asNumber(data.overdueTasks);
  const overduePart = overdue > 0 ? `, with ${plural(overdue, "overdue task")}` : "";
  if (kind === "health") {
    return `${name} is ${health}. Progress is ${progress}%${overduePart}.`;
  }
  return `${name} is ${health}. Progress is ${progress}%${overduePart}.`;
}

export function formatAssistantResponse(
  intent: AssistantIntent,
  data: Record<string, unknown>,
  sources: AssistantSource[],
): FormattedAssistantAnswer {
  let answer = "";

  switch (intent) {
    case "PENDING_TASKS":
      answer = formatPending(data);
      break;
    case "OVERDUE_TASKS":
      answer = formatOverdue(data);
      break;
    case "TODAY_TASKS": {
      const count = asNumber(data.count);
      answer =
        count === 0
          ? "You currently have no tasks due today."
          : `You have ${plural(count, "task")} due today.${showingNote(count, asNumber(data.showing))}`;
      break;
    }
    case "TASK_SUMMARY": {
      const pending = asNumber(data.pending);
      const overdue = asNumber(data.overdue);
      answer = `You have ${plural(pending, "pending task")} and ${plural(overdue, "overdue task")}.`;
      break;
    }
    case "PROJECT_STATUS":
      answer = formatProject(data, "status");
      if (asString(data.manager)) {
        answer += ` ${asString(data.manager)} is responsible.`;
      }
      break;
    case "PROJECT_HEALTH":
      if (data.name) {
        answer = formatProject(data, "health");
      } else {
        const atRisk = asNumber(data.atRisk);
        const critical = asNumber(data.critical);
        answer =
          atRisk + critical === 0
            ? "No projects are currently at risk."
            : `${plural(atRisk, "project")} ${atRisk === 1 ? "is" : "are"} at risk and ${plural(critical, "project")} ${critical === 1 ? "is" : "are"} critical.`;
      }
      break;
    case "PROJECT_TASKS": {
      const count = asNumber(data.count);
      const name = asString(data.name, "This project");
      answer =
        count === 0
          ? `${name} currently has no tasks.`
          : `${name} has ${plural(count, "task")}.${showingNote(count, asNumber(data.showing))}`;
      break;
    }
    case "PROJECT_FINANCE": {
      const name = asString(data.name, "This project");
      answer = `${name} has spent ${formatInrCompact(asNumber(data.expense))} of ${formatInrCompact(asNumber(data.budget))}. Remaining is ${formatInrCompact(asNumber(data.remaining))} (${asNumber(data.utilization)}% utilized).`;
      break;
    }
    case "TODAY_MEETINGS": {
      const count = asNumber(data.count);
      const meetings = Array.isArray(data.meetings) ? data.meetings : [];
      answer =
        count === 0
          ? "You currently have no meetings today."
          : `You have ${plural(count, "meeting")} today.${meetingLines(meetings)}${showingNote(count, asNumber(data.showing))}`;
      break;
    }
    case "UPCOMING_MEETINGS": {
      const count = asNumber(data.count);
      const meetings = Array.isArray(data.meetings) ? data.meetings : [];
      answer =
        count === 0
          ? "You currently have no upcoming meetings."
          : `You have ${plural(count, "upcoming meeting")}.${meetingLines(meetings)}${showingNote(count, asNumber(data.showing))}`;
      break;
    }
    case "MEETING_SUMMARY":
      answer = `You have ${plural(asNumber(data.todayCount), "meeting")} today and ${plural(asNumber(data.scheduled), "scheduled meeting")} overall.`;
      break;
    case "SALES_SUMMARY":
      answer = `Sales currently has ${plural(asNumber(data.openOpportunities), "open opportunity")} worth ${formatInrCompact(asNumber(data.pipeline))}. There are ${asNumber(data.leads)} leads, including ${asNumber(data.qualifiedLeads)} qualified.`;
      break;
    case "SALES_PIPELINE": {
      const stages = Array.isArray(data.stages) ? data.stages : [];
      answer = `Open pipeline is ${formatInrCompact(asNumber(data.openValue))} across ${stages.length} stages.`;
      break;
    }
    case "LEAD_SUMMARY":
      answer = `There are ${plural(asNumber(data.total), "lead")}, including ${asNumber(data.qualified)} qualified.`;
      break;
    case "OPPORTUNITY_SUMMARY":
      answer = `There are ${plural(asNumber(data.open), "open opportunity")} worth ${formatInrCompact(asNumber(data.pipeline))}.`;
      break;
    case "FINANCE_SUMMARY":
      answer = `Recorded income is ${formatInrCompact(asNumber(data.income))} and expense is ${formatInrCompact(asNumber(data.expense))}. Net is ${formatInrCompact(asNumber(data.net))}.`;
      break;
    case "MONTHLY_FINANCE":
      answer = `This month, recorded income is ${formatInrCompact(asNumber(data.income))} and expense is ${formatInrCompact(asNumber(data.expense))}. Net is ${formatInrCompact(asNumber(data.net))}.`;
      break;
    case "WEEKLY_FINANCIAL_REQUIREMENT": {
      const basis = asString(
        data.basis,
        "This uses completed and pending INCOME/EXPENSE transactions dated this week. Payables are not modeled yet.",
      );
      answer = `This week, planned expenses are ${formatInrCompact(asNumber(data.plannedExpenses))} against expected income of ${formatInrCompact(asNumber(data.expectedIncome))}. Net requirement is ${formatInrCompact(asNumber(data.netRequirement))}. ${basis}`;
      break;
    }
    case "BUDGET_SUMMARY": {
      const over = Array.isArray(data.overBudgetProjects) ? data.overBudgetProjects.length : 0;
      const overPart = over > 0 ? ` ${plural(over, "project")} ${over === 1 ? "is" : "are"} over budget.` : " No projects are over budget.";
      answer = `Total budget is ${formatInrCompact(asNumber(data.totalBudget))} with ${formatInrCompact(asNumber(data.actualExpense))} actual expense (${asNumber(data.utilization)}% utilized).${overPart}`;
      break;
    }
    case "ATTENTION_ITEMS": {
      const items = Array.isArray(data.items) ? (data.items as Array<Record<string, unknown>>) : [];
      if (items.length === 0) {
        answer = "Bottom line: nothing requires your attention from live records today.";
        break;
      }
      const lines = items.slice(0, 5).map((item, index) => `${index + 1}. ${asString(item.title, asString(item.type, "Item"))}.`);
      answer = `Bottom line: ${plural(asNumber(data.count) || items.length, "item")} need attention today.\n${lines.join("\n")}\nRecommended action: start with the first item on this list.`;
      break;
    }
    case "MORNING_REPORT": {
      const attention = asNumber(data.attentionCount);
      const greeting = "Good morning.";
      const attentionLine =
        attention === 0
          ? " Nothing requires your attention today."
          : ` You have ${plural(attention, "item")} requiring attention today.`;
      const financeLine =
        data.financeAvailable === false
          ? ""
          : ` This month's recorded income is ${formatInrCompact(asNumber(data.income))} and expense is ${formatInrCompact(asNumber(data.expense))}.`;
      const salesLine =
        data.pipeline === null || data.pipeline === undefined
          ? ""
          : ` Your open sales pipeline is ${formatInrCompact(asNumber(data.pipeline))}.`;
      answer = `${greeting}${attentionLine} ${plural(asNumber(data.pendingTasks), "task")} ${asNumber(data.pendingTasks) === 1 ? "is" : "are"} pending and ${asNumber(data.overdueTasks)} ${asNumber(data.overdueTasks) === 1 ? "is" : "are"} overdue. You have ${plural(asNumber(data.todayMeetings), "meeting")} today. ${plural(asNumber(data.atRiskProjects), "project")} ${asNumber(data.atRiskProjects) === 1 ? "is" : "are"} currently at risk.${salesLine}${financeLine}`;
      break;
    }
    case "COMPANY_SUMMARY": {
      const projects = data.projects && typeof data.projects === "object" ? (data.projects as Record<string, unknown>) : {};
      const tasks = data.tasks && typeof data.tasks === "object" ? (data.tasks as Record<string, unknown>) : {};
      const sales = data.sales && typeof data.sales === "object" ? (data.sales as Record<string, unknown>) : {};
      const finance = data.finance && typeof data.finance === "object" ? (data.finance as Record<string, unknown>) : {};
      const financeLine =
        finance.available === false
          ? ""
          : ` Finance: income ${formatInrCompact(asNumber(finance.income))}, expense ${formatInrCompact(asNumber(finance.expense))}.`;
      answer = `Company snapshot: ${plural(asNumber(projects.active), "active project")}, ${plural(asNumber(projects.atRisk), "at-risk project")}. Tasks: ${asNumber(tasks.pending)} pending, ${asNumber(tasks.overdue)} overdue. Sales pipeline ${formatInrCompact(asNumber(sales.pipeline))}. ${plural(asNumber(data.attention), "attention item")}.${financeLine}`;
      break;
    }
    case "MY_WORK_SUMMARY":
      answer = `You have ${plural(asNumber(data.pendingTasks), "pending task")} (${asNumber(data.overdueTasks)} overdue), ${plural(asNumber(data.todayMeetings), "meeting")} today, and ${plural(asNumber(data.followUps), "follow-up")}.`;
      break;
    case "EMPLOYEE_DAILY_STATUS": {
      const name = asString(data.employeeName, "That employee");
      const overdue = asNumber(data.overdueTasks);
      const pending = asNumber(data.pendingTasks);
      const today = asNumber(data.todayTasks);
      const meetings = asNumber(data.todayMeetings);
      const projects = Array.isArray(data.projects) ? (data.projects as string[]).filter(Boolean) : [];
      const bottom =
        overdue > 0
          ? `${name} has ${plural(overdue, "overdue task")} that need attention today.`
          : `${name} has ${plural(pending, "pending task")} and ${plural(meetings, "meeting")} today.`;
      const projectLine = projects.length ? ` Key work is on ${projects.slice(0, 3).join(", ")}.` : "";
      answer = `Bottom line: ${bottom} Current status: ${plural(today, "task")} due today, ${pending} pending, ${asNumber(data.completedTasks)} completed in the recent list.${projectLine} Attendance and leave are not in this system. Recommended action: ${overdue > 0 ? `clear ${name}'s overdue work first.` : `review ${name}'s today tasks and meetings.`}`;
      break;
    }
    case "EMPLOYEE_OVERDUE_RANKING": {
      const employees = Array.isArray(data.employees) ? (data.employees as Array<Record<string, unknown>>) : [];
      if (employees.length === 0) {
        answer = "No overdue tasks were found for employees in your scope.";
        break;
      }
      const top = employees[0];
      const second = employees[1];
      const follow =
        second && asNumber(second.overdue) > 0
          ? `, followed by ${asString(second.employee)} with ${asNumber(second.overdue)}`
          : "";
      answer = `${asString(top.employee)} currently has the highest overdue workload with ${asNumber(top.overdue)} tasks${follow}.`;
      break;
    }
    case "EMPLOYEE_WORKLOAD": {
      const employees = Array.isArray(data.employees) ? (data.employees as Array<Record<string, unknown>>) : [];
      if (employees.length === 0) {
        answer = "No employee workload matched that request.";
        break;
      }
      const top = employees[0];
      answer = `${asString(top.employeeName)} has the highest pending workload with ${asNumber(top.pendingTasks)} pending tasks (${asNumber(top.overdueTasks)} overdue).`;
      break;
    }
    case "DELAYED_PROJECT_WORKLOAD": {
      const projects = Array.isArray(data.projects) ? (data.projects as Array<Record<string, unknown>>) : [];
      if (projects.length === 0) {
        answer = "No delayed projects with matching employee workload were found.";
        break;
      }
      const lines = projects.slice(0, 3).map((project) => {
        const people = Array.isArray(project.employees)
          ? (project.employees as Array<Record<string, unknown>>)
          : [];
        const lead = people[0];
        const workload = lead
          ? ` ${asString(lead.employeeName)} has ${asNumber(lead.pendingTasks)} pending tasks on this project, a high workload concentration.`
          : "";
        const spend =
          asNumber(project.expense) > 0
            ? ` Spend is ${formatInrCompact(asNumber(project.expense))} of ${formatInrCompact(asNumber(project.budget))}.`
            : "";
        return `${asString(project.projectName)} appears affected at ${asNumber(project.progress)}% progress with ${asNumber(project.pendingTasks)} pending and ${asNumber(project.overdueTasks)} overdue tasks.${spend}${workload}`;
      });
      answer = lines.join(" ");
      break;
    }
    case "DYNAMIC_QUERY": {
      const projects = Array.isArray(data.projects) ? (data.projects as Array<Record<string, unknown>>) : [];
      const tasks = Array.isArray(data.tasks) ? (data.tasks as Array<Record<string, unknown>>) : [];
      const employees = Array.isArray(data.employees) ? (data.employees as Array<Record<string, unknown>>) : [];
      if (employees.length > 0) {
        const top = employees[0];
        answer = `${asString(top.employee || top.employeeName)} has ${asNumber(top.overdueTasks || top.count)} matching tasks (${asNumber(top.pendingTasks)} pending).`;
        break;
      }
      if (typeof data.count === "number" && projects.length > 0) {
        const names = projects
          .slice(0, 5)
          .map((item) => asString(item.projectName || item.name))
          .filter(Boolean);
        const status = asString(projects[0]?.status);
        answer = names.length
          ? `I found ${asNumber(data.count)} matching ${plural(asNumber(data.count), "project")}: ${names.join(", ")}${status ? ` (${status})` : ""}.`
          : `I found ${asNumber(data.count)} matching projects.`;
        break;
      }
      if (typeof data.count === "number" && tasks.length > 0) {
        answer = `I found ${plural(asNumber(data.count), "matching task")}. Showing ${tasks.length}.`;
        break;
      }
      if (typeof data.pendingTasks === "number" || typeof data.overdueTasks === "number") {
        answer = `There are ${asNumber(data.pendingTasks)} pending tasks and ${asNumber(data.overdueTasks)} overdue tasks.`;
        break;
      }
      if (data.dashboard) {
        answer = "Here is the current business snapshot from live records.";
        break;
      }
      if (typeof data.count === "number") {
        answer = `I found ${asNumber(data.count)} matching records.`;
        break;
      }
      answer = "No matching business data was found for that question.";
      break;
    }
    case "SMALLTALK":
      answer =
        "Hi! I'm your office assistant. Ask me about projects, tasks, people, meetings, or sales.";
      break;
    case "UNSUPPORTED":
    default:
      answer =
        "I can't answer that yet. I currently support company tasks, projects, meetings, sales, finance, and executive reports.";
      break;
  }

  return { answer: answer.trim(), data, sources };
}

export const responseFormatterService = {
  format: formatAssistantResponse,
  formatInrCompact,
};
