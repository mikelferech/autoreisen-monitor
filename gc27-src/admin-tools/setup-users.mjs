import fs from "node:fs/promises";
import process from "node:process";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const file = process.argv[2] || "users.json";
const users = JSON.parse(await fs.readFile(file, "utf8"));
initializeApp({ credential: applicationDefault() });
const auth = getAuth();
const db = getFirestore();

for (const entry of users) {
  let user;
  try { user = await auth.getUserByEmail(entry.email); }
  catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    if (!entry.password) throw new Error(`El usuario ${entry.email} no existe y falta password para crearlo.`);
    user = await auth.createUser({ email:entry.email, password:entry.password, displayName:entry.displayName || entry.email, emailVerified:false });
    console.log(`Creado en Auth: ${entry.email}`);
  }
  if (entry.password && entry.resetPassword === true) await auth.updateUser(user.uid,{password:entry.password});
  await db.doc(`mfeUsers/${user.uid}`).set({
    email:entry.email,
    displayName:entry.displayName || user.displayName || entry.email,
    role:entry.role || "viewer",
    apps:entry.apps || {travel:true},
    updatedAt:new Date()
  },{merge:true});
  console.log(`Perfil actualizado: ${entry.email} (${entry.role || "viewer"})`);
}
console.log("Usuarios terminados.");
