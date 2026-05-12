import { getSession, setSession } from '@/lib/auth';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const businessId = body?.businessId as string | undefined;

  if (!businessId) {
    return Response.json({ message: 'Falta el negocio' }, { status: 400 });
  }

  const session = await getSession();
  if (!session) {
    return Response.json({ message: 'No hay sesión activa' }, { status: 401 });
  }

  const valid = session.memberships.some((m) => m.businessId === businessId);
  if (!valid) {
    return Response.json({ message: 'No pertenecés a este negocio' }, { status: 403 });
  }

  await setSession({ ...session, activeBusinessId: businessId });

  return Response.json({ ok: true });
}
