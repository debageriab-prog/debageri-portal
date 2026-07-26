import { getAdminServices } from "@/lib/firebase/admin";
import { verifySession } from "@/server/auth/session";
import { TimeCodeManagement } from "./TimeCodeManagement";

export default async function TimeCodesPage() {
  const user = (await verifySession())!;
  const { db } = getAdminServices();
  const snapshot = await db
    .collection("timeCodes")
    .where("organizationId", "==", user.organizationId)
    .get();
  const codes = snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        code: String(data.code),
        name: String(data.name?.en ?? data.name?.sv ?? data.code),
        category: String(data.category),
        hourlyRate: Number(data.hourlyRate ?? 0),
        active: Boolean(data.active),
        employeeCanSelect: data.employeeCanSelect !== false,
        requiresComment: Boolean(data.requiresComment),
        countsAsWorkedTime: Boolean(data.countsAsWorkedTime),
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
  return <TimeCodeManagement codes={codes} />;
}
