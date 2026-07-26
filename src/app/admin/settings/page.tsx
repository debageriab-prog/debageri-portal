import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
export default async function SettingsPage() {
  const user = (await verifySession())!;
  const { db } = getAdminServices();
  const snapshot = await db
    .collection("organizations")
    .doc(user.organizationId)
    .get();
  const organization = snapshot.data();
  return (
    <>
      <div className="topbar">
        <div>
          <div className="eyebrow">Admin</div>
          <h1>Organization</h1>
          <p className="muted page-description">
            Review the shared settings that control language, timezone and
            organization identity.
          </p>
        </div>
      </div>
      <section className="card">
        {!organization ? (
          <p>Organization settings are not configured.</p>
        ) : (
          <>
            <h2>{String(organization.name)}</h2>
            <p>
              <strong>ID</strong>
              <br />
              {snapshot.id}
            </p>
            <p>
              <strong>Timezone</strong>
              <br />
              {String(organization.timezone)}
            </p>
            <p>
              <strong>Locale</strong>
              <br />
              {String(organization.locale)}
            </p>
          </>
        )}
      </section>
    </>
  );
}
