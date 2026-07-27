import "server-only";

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getAppCheck } from "firebase-admin/app-check";
import { getFirestore } from "firebase-admin/firestore";
import { validatePortalEnvironment } from "@/lib/config/environment";

export function getAdminServices() {
  const env = validatePortalEnvironment();
  const existing = getApps()[0];
  const credential =
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
    process.env.FIREBASE_ADMIN_PRIVATE_KEY
      ? cert({
          projectId: env.adminProjectId,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(
            /\\n/g,
            "\n",
          ),
        })
      : applicationDefault();
  const app =
    existing ?? initializeApp({ projectId: env.adminProjectId, credential });
  return {
    appCheck: getAppCheck(app),
    auth: getAuth(app),
    db: getFirestore(app),
  };
}
