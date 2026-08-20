import { employeeRepository } from "../repositories/employee.repository";
import { projectRepository } from "../repositories/project.repository";
import { type Actor, isPrivileged } from "./finance.policy";
import { canManageProject, canViewProject } from "./project.policy";
import { BadRequestError, ForbiddenError, NotFoundError } from "../utils/errors";

export const ID_RETRIES = 3;

export async function resolveFinanceScope(actor: Actor): Promise<{
  employeeId: string | null;
  projectIds: string[] | null;
}> {
  if (isPrivileged(actor.role)) {
    const mine = await employeeRepository.findByUserId(actor.id);
    return { employeeId: mine ? String(mine._id) : null, projectIds: null };
  }

  const mine = await employeeRepository.findByUserId(actor.id);
  const employeeId = mine ? String(mine._id) : null;
  if (!employeeId) return { employeeId: null, projectIds: [] };

  const rows =
    actor.role === "MANAGER"
      ? await projectRepository.findIdsByManager(employeeId)
      : await projectRepository.findAccessibleIds(employeeId);

  return { employeeId, projectIds: rows.map((row) => String(row._id)) };
}

export async function assertProjectAccess(
  actor: Actor,
  projectId: string,
  mode: "view" | "manage",
  missing: "badRequest" | "notFound" = "badRequest",
): Promise<{ managerId: string; members: string[]; budget: number; projectId: string }> {
  const { employeeId } = await resolveFinanceScope(actor);
  const project = await projectRepository.findById(projectId);
  if (!project || project.isDeleted) {
    if (missing === "notFound") throw new NotFoundError("Project not found");
    throw new BadRequestError("Project not found", [{ field: "projectId", message: "Project must exist" }]);
  }
  const snapshot = {
    managerId: String(project.managerId),
    members: (project.members ?? []).map((member) => String(member)),
    budget: project.budget ?? 0,
    projectId: project.projectId,
  };
  if (mode === "manage") {
    if (!canManageProject(actor, snapshot, employeeId) && !isPrivileged(actor.role)) {
      throw new ForbiddenError("You do not have permission to post finance against this project");
    }
  } else if (!canViewProject(actor, snapshot, employeeId)) {
    throw new ForbiddenError("You do not have permission to view this project finance");
  }
  return snapshot;
}
