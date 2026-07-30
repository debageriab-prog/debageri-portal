import {
  applicationDefault,
  deleteApp,
  initializeApp,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const sourceProjectId: string = "debageri-portal";
const destinationProjectId: string = "debageri-portal-dev";
const collectionName = "holidays";

if (sourceProjectId === destinationProjectId) {
  throw new Error("Source and destination projects must be different.");
}

const credential = applicationDefault();
const sourceApp = initializeApp(
  { credential, projectId: sourceProjectId },
  "one-time-holiday-source",
);
const destinationApp = initializeApp(
  { credential, projectId: destinationProjectId },
  "one-time-holiday-destination",
);

async function main() {
  try {
    const source = getFirestore(sourceApp);
    const destination = getFirestore(destinationApp);
    const snapshot = await source.collection(collectionName).get();

    if (snapshot.empty) {
      throw new Error(
        `Refusing to continue because ${sourceProjectId}/${collectionName} is empty.`,
      );
    }

    for (let offset = 0; offset < snapshot.docs.length; offset += 500) {
      const batch = destination.batch();

      for (const document of snapshot.docs.slice(offset, offset + 500)) {
        batch.set(
          destination.collection(collectionName).doc(document.id),
          document.data(),
        );
      }

      await batch.commit();
    }

    const copiedIds = snapshot.docs.map((document) => document.id).sort();
    console.log(
      `Copied ${copiedIds.length} ${collectionName} documents from ${sourceProjectId} to ${destinationProjectId}.`,
    );
    console.log(`Document IDs: ${copiedIds.join(", ")}`);
  } finally {
    await Promise.all([deleteApp(sourceApp), deleteApp(destinationApp)]);
  }
}

void main();
