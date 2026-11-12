/* PERFECTKEY - the programs this site makes keys for. This file is PUBLIC (the site can be on GitHub Pages):
   it holds NO secrets. Every program's secret and inbox room live in the Cloudflare Worker (PerfectKey/server/worker.js,
   variables SECRETS and INBOX - the values are in PerfectKey/ค่าสำหรับ-Cloudflare.txt).

   tag         3 ASCII chars mixed into every key's MAC (the worker finds the secret by this tag)
   machineSalt the text the program puts in front of the Windows MachineGuid before hashing it into its machine ID (see verify/)
   inbox       true = the program's "แจ้งปัญหา" button is connected (its ntfy room is in INBOX on the worker)
   ls          localStorage names the old offline page used (only read once, to upload old history to the server)

   To add a program: add a block here (new id/name/tag/machineSalt), then add its secret to SECRETS on the worker
   (PowerShell: $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)). */

/* the PERFECTKEY worker: makes/checks keys, history, inbox, and activates "1 key = 1 PC" keys for the programs */
window.SERVER = { url: "https://perfectkey.appplayanucha.workers.dev" };

window.PRODUCTS = [
  {
    id: "perfectkit", name: "PERFECTKIT", mark: "PK", sub: "ส่วนขยาย Premiere Pro / After Effects",
    tag: "PK2", machineSalt: "PERFECTKIT",
    howTo: "เปิด PERFECTKIT ใน Premiere Pro หรือ After Effects → วางคีย์ในช่อง → กด \"เปิดใช้งาน\"",
    inbox: true,
    ls: { hist: "pk_keygen_history", inbox: "pk_inbox", read: "pk_inbox_read", del: "pk_inbox_deleted" }
  },
  {
    id: "kiomizerplay", name: "KIOmizerPlay", mark: "KP", sub: "โปรแกรม KIOmizerPlay",
    tag: "KP2", machineSalt: "KIOMIZERPLAY",
    howTo: "เปิด KIOmizerPlay → วางคีย์ในช่องเปิดใช้งาน → กดยืนยัน",
    inbox: true,
    ls: {}
  },
  {
    id: "pcoptimizer", name: "PCOptimizer", mark: "PO", sub: "โปรแกรม PCOptimizer",
    tag: "PO2", machineSalt: "PCOPTIMIZER",
    howTo: "เปิด PCOptimizer → วางคีย์ในช่องเปิดใช้งาน → กดยืนยัน",
    inbox: true,
    ls: {}
  },
  /* Websites. A web key is the customer's login: no machine ID - the 32-bit machine field carries the package code
     instead (plans[].code). The key works once: the first account that uses it owns it.
     SetBio    (C:\Users\Administrator\KioBio, GitHub Pages + its own worker): the same secret is SB_SECRET on the SetBio worker.
     SetDonate (C:\Users\Administrator\SetDonate, C# server): data/config.json "keySecretDonate". */
  {
    id: "setbio", name: "SetBio", mark: "SB", sub: "เว็บ Biolink (ใส่คีย์แทนการสมัคร/ล็อกอิน)",
    tag: "SB2", machineSalt: "SETBIO",
    // edit: true = the history tab can add time / change the package / close an old key (needs SETBIO + SETBIO_TOKEN on the worker)
    web: { plans: [{ code: 2, name: "Pro", sub: "ปลดล็อกทุกฟีเจอร์" }, { code: 1, name: "Free", sub: "บัญชีฟรี (ฟีเจอร์จำกัด)" }], edit: true },
    howTo: "เข้าเว็บ SetBio → กด \"เข้าสู่ระบบ\" → วางคีย์ → ตั้งชื่อหน้า (ครั้งแรก) · ครั้งต่อไปใช้คีย์เดิมเข้าสู่ระบบ · ถ้ามีบัญชีอยู่แล้ว ใส่คีย์ที่แท็บ \"บัญชี\" ในหน้าแต่ง หรือหน้า \"อัปเกรด\" เพื่อต่ออายุ (เวลาที่เหลือจะบวกเพิ่ม)",
    inbox: false,
    ls: {}
  },
  {
    id: "setdonate", name: "SetDonate", mark: "SD", sub: "เว็บรับโดเนทสตรีมเมอร์ (ใส่คีย์แทนการสมัคร/ล็อกอิน)",
    tag: "SD2", machineSalt: "SETDONATE",
    web: { plans: [{ code: 4, name: "Ultra", sub: "ไม่จำกัด" }, { code: 3, name: "Pro", sub: "80 ครั้ง/เดือน" }, { code: 2, name: "Lite", sub: "30 ครั้ง/เดือน" }, { code: 1, name: "Basic", sub: "ฟรี 10 ครั้ง/เดือน" }] },
    howTo: "เข้าเว็บ SetDonate → กด \"เข้าสู่ระบบ\" → วางคีย์ → ตั้งชื่อผู้ใช้ (ครั้งแรก) · ครั้งต่อไปใช้คีย์เดิมล็อกอิน · ถ้ามีบัญชีอยู่แล้ว ใส่คีย์ที่เมนู \"แพลน\" เพื่ออัปเกรด/ต่ออายุ",
    inbox: false,
    ls: {}
  }
];
