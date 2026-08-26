"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { requireUser, audit } from "./guard";

export async function changePasswordAction(fd: FormData) {
  const me = await requireUser();
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  if (next.length < 8) redirect("/account?error=invalid");

  const user = await prisma.user.findUnique({ where: { id: me.id } });
  if (!user?.passwordHash || !(await bcrypt.compare(current, user.passwordHash))) {
    redirect("/account?error=wrong");
  }
  await prisma.user.update({
    where: { id: me.id },
    data: { passwordHash: await bcrypt.hash(next, 12) },
  });
  await audit(me.id, null, "user.password_change", "user", me.id);
  redirect("/account?ok=1");
}
