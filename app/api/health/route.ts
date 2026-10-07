import {serverReadiness} from '../../../lib/server-readiness';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const state = await serverReadiness();
  return Response.json({status: state.ready ? 'ready' : 'unavailable', code: state.code}, {
    status: state.ready ? 200 : 503,
    headers: {'Cache-Control': 'no-store'},
  });
}
