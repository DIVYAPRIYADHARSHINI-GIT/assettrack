// Seed: 1 admin, 1 viewer, 6 categories, 40 assets with realistic history.
// Idempotent-ish: it wipes asset data and recreates it, keeping the schema.
// Warranty dates are relative to "today" so the 30/60/90-day widgets always have data.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const day = (offset) => {
  const n = new Date();
  const d = new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
const tag = (n) => `AT-${String(n).padStart(4, '0')}`;

const CATEGORIES = [
  ['Laptop', 'Notebook computers issued to staff'],
  ['Monitor', 'External displays'],
  ['Phone', 'Mobile phones and desk phones'],
  ['Furniture', 'Desks, chairs and storage'],
  ['Accessories', 'Keyboards, mice, headsets, docks and peripherals'],
  ['Other', 'Anything that does not fit another category'],
];

const LOCATIONS = ['Bengaluru HQ - Floor 2', 'Bengaluru HQ - Floor 3', 'Chennai Office', 'Hyderabad Office', 'IT Store Room'];

// [name, category, brand, model, serialPrefix, price, vendor, purchaseOffsetDays, warrantyOffsetDays]
// warrantyOffsetDays is relative to TODAY (negative = expired).
const ASSETS = [
  ['Dell Latitude 5440', 'Laptop', 'Dell', 'Latitude 5440', 'DL5440', 78500, 'Dell India', -420, 680],
  ['Dell Latitude 7440', 'Laptop', 'Dell', 'Latitude 7440', 'DL7440', 112000, 'Dell India', -700, 12],
  ['Lenovo ThinkPad T14 Gen 4', 'Laptop', 'Lenovo', 'ThinkPad T14 G4', 'LNT14', 92500, 'Lenovo Store B2B', -300, 795],
  ['Lenovo ThinkPad E14', 'Laptop', 'Lenovo', 'ThinkPad E14 G5', 'LNE14', 64990, 'Lenovo Store B2B', -1050, 45],
  ['Apple MacBook Air M2', 'Laptop', 'Apple', 'MacBook Air 13 M2', 'MBA13', 114900, 'Imagine Apple Reseller', -380, 350],
  ['Apple MacBook Pro 14', 'Laptop', 'Apple', 'MacBook Pro 14 M3', 'MBP14', 169900, 'Imagine Apple Reseller', -200, 165],
  ['HP EliteBook 840 G10', 'Laptop', 'HP', 'EliteBook 840 G10', 'HP840', 98000, 'HP World', -1100, -30],
  ['HP ProBook 450 G9', 'Laptop', 'HP', 'ProBook 450 G9', 'HP450', 61500, 'HP World', -1000, 75],
  ['Asus ExpertBook B5', 'Laptop', 'Asus', 'ExpertBook B5', 'ASB5', 72000, 'Asus Exclusive', -150, 945],
  ['Dell Latitude 3540', 'Laptop', 'Dell', 'Latitude 3540', 'DL3540', 54500, 'Dell India', -1400, -300],
  ['Dell P2422H Monitor', 'Monitor', 'Dell', 'P2422H', 'DP2422', 16500, 'Dell India', -500, 25],
  ['Dell U2723QE 4K Monitor', 'Monitor', 'Dell', 'U2723QE', 'DU2723', 48900, 'Dell India', -260, 835],
  ['LG 27UL500 Monitor', 'Monitor', 'LG', '27UL500', 'LG27UL', 18990, 'Croma Business', -640, 55],
  ['LG 24MP400 Monitor', 'Monitor', 'LG', '24MP400', 'LG24MP', 9800, 'Croma Business', -900, -100],
  ['Samsung 32" Curved Monitor', 'Monitor', 'Samsung', 'LC32R500', 'SM32C', 21500, 'Reliance Digital', -330, 400],
  ['BenQ GW2480 Monitor', 'Monitor', 'BenQ', 'GW2480', 'BQ2480', 10500, 'Amazon Business', -720, 8],
  ['Apple iPhone 14', 'Phone', 'Apple', 'iPhone 14 128GB', 'IP14', 69900, 'Imagine Apple Reseller', -480, 250],
  ['Samsung Galaxy S23', 'Phone', 'Samsung', 'Galaxy S23', 'SGS23', 74999, 'Samsung Shop', -350, 380],
  ['Google Pixel 8', 'Phone', 'Google', 'Pixel 8', 'GP8', 75999, 'Flipkart Wholesale', -120, 610],
  ['Samsung Galaxy A54', 'Phone', 'Samsung', 'Galaxy A54', 'SGA54', 38999, 'Samsung Shop', -700, 28],
  ['Cisco IP Desk Phone', 'Phone', 'Cisco', 'CP-8841', 'CS8841', 14500, 'Ingram Micro', -1500, -500],
  ['OnePlus Nord CE 3', 'Phone', 'OnePlus', 'Nord CE 3', 'OPN3', 26999, 'Amazon Business', -260, 85],
  ['Featherlite Ergonomic Chair', 'Furniture', 'Featherlite', 'Optima HB', 'FLCH', 14200, 'Featherlite Furniture', -800, 1000],
  ['Featherlite Ergonomic Chair', 'Furniture', 'Featherlite', 'Optima HB', 'FLCH', 14200, 'Featherlite Furniture', -800, 1000],
  ['Godrej Sit-Stand Desk', 'Furniture', 'Godrej Interio', 'Motion Desk', 'GDSK', 38500, 'Godrej Interio', -400, 1430],
  ['Godrej Storage Cabinet', 'Furniture', 'Godrej Interio', 'Slimline 4 Door', 'GDCB', 21800, 'Godrej Interio', -1200, 625],
  ['Conference Table 8-Seater', 'Furniture', 'Durian', 'Boardroom 2400', 'DRCT', 54000, 'Durian Office', -950, 1600],
  ['Green Soul Office Chair', 'Furniture', 'Green Soul', 'Seoul Mid Back', 'GSCH', 9500, 'Amazon Business', -300, 64],
  ['Logitech MX Keys Keyboard', 'Accessories', 'Logitech', 'MX Keys', 'LGMXK', 10995, 'Amazon Business', -400, 330],
  ['Logitech MX Master 3S Mouse', 'Accessories', 'Logitech', 'MX Master 3S', 'LGMX3', 8995, 'Amazon Business', -400, 330],
  ['Jabra Evolve2 65 Headset', 'Accessories', 'Jabra', 'Evolve2 65', 'JBE65', 18500, 'Ingram Micro', -650, 80],
  ['Dell WD19S Docking Station', 'Accessories', 'Dell', 'WD19S', 'DWD19', 17900, 'Dell India', -540, 190],
  ['Anker USB-C Hub 7-in-1', 'Accessories', 'Anker', 'A8346', 'ANKH7', 3499, 'Amazon Business', -230, 135],
  ['Logitech C920 Webcam', 'Accessories', 'Logitech', 'C920 HD Pro', 'LGC920', 6995, 'Amazon Business', -760, 20],
  ['Apple Magic Keyboard', 'Accessories', 'Apple', 'Magic Keyboard', 'APMK', 9500, 'Imagine Apple Reseller', -300, 65],
  ['Epson EcoTank Printer', 'Other', 'Epson', 'L3250', 'EPL32', 15499, 'Croma Business', -880, 60],
  ['Epson Projector EB-X51', 'Other', 'Epson', 'EB-X51', 'EPX51', 42000, 'Croma Business', -1300, -235],
  ['APC UPS 1500VA', 'Other', 'APC', 'BX1500M', 'APCUPS', 11200, 'Ingram Micro', -500, 230],
  ['Apple iPad 10th Gen', 'Other', 'Apple', 'iPad 10.9 Wi-Fi', 'IPAD10', 39900, 'Imagine Apple Reseller', -180, 185],
  ['Netgear Wi-Fi Router', 'Other', 'Netgear', 'Nighthawk RAX50', 'NGRAX', 22500, 'Amazon Business', -620, 110],
];

const EMPLOYEES = [
  ['Arjun Mehta', 'arjun.mehta@northwind.example', 'Engineering'],
  ['Priya Raman', 'priya.raman@northwind.example', 'Design'],
  ['Karthik Subramanian', 'karthik.s@northwind.example', 'Engineering'],
  ['Sneha Iyer', 'sneha.iyer@northwind.example', 'Finance'],
  ['Rahul Verma', 'rahul.verma@northwind.example', 'Sales'],
  ['Ananya Krishnan', 'ananya.k@northwind.example', 'Human Resources'],
  ['Vikram Nair', 'vikram.nair@northwind.example', 'Operations'],
  ['Meera Pillai', 'meera.pillai@northwind.example', 'Marketing'],
  ['Rohan Das', 'rohan.das@northwind.example', 'Engineering'],
  ['Divya Shankar', 'divya.shankar@northwind.example', 'Customer Success'],
  ['Farhan Qureshi', 'farhan.q@northwind.example', 'Sales'],
  ['Lakshmi Narayanan', 'lakshmi.n@northwind.example', 'Finance'],
  ['Siddharth Rao', 'siddharth.rao@northwind.example', 'Engineering'],
  ['Kavya Reddy', 'kavya.reddy@northwind.example', 'Design'],
  ['Naveen Kumar', 'naveen.kumar@northwind.example', 'Operations'],
  ['Ishita Bose', 'ishita.bose@northwind.example', 'Marketing'],
];

// Asset index (0-based) -> desired final state
const ASSIGNED = [0, 1, 2, 4, 5, 8, 11, 12, 14, 16, 17, 18, 22, 24, 28, 29, 31, 38];
const UNDER_REPAIR = { 3: ['Battery swelling, will not hold charge', 'Lenovo Service Centre', 4200], 19: ['Cracked screen', 'Samsung Service Plaza', 6800], 30: ['Left ear cup not working', 'Jabra Authorised Service', 0] };
const RETIRED = [9, 13, 20, 36];
// Assets that have past (returned) assignments and past (completed) repairs, for history
const PAST_ASSIGN = [0, 2, 6, 7, 10, 15, 23, 33];
const PAST_REPAIR = { 6: ['Keyboard keys sticking', 'HP World Service', 3500], 0: ['Fan noise, thermal paste', 'Dell India Service', 1800], 15: ['Dead pixels near edge', 'BenQ Service', 0], 34: ['Key replacement', 'Imagine Service', 1200] };

async function main() {
  console.log('Seeding AssetTrack…');
  await prisma.$transaction([
    prisma.activityLog.deleteMany(),
    prisma.repair.deleteMany(),
    prisma.assignment.deleteMany(),
    prisma.asset.deleteMany(),
    prisma.category.deleteMany(),
    prisma.revokedToken.deleteMany(),
    prisma.counter.deleteMany(),
  ]);
  // Restart id sequences so a fresh seed always gives AT-0001 id 1, etc.
  for (const t of ['Asset', 'Category', 'Assignment', 'Repair', 'ActivityLog']) {
    await prisma.$executeRawUnsafe(`ALTER SEQUENCE "${t}_id_seq" RESTART WITH 1`);
  }

  const adminHash = await bcrypt.hash('Admin@123', 10);
  const viewerHash = await bcrypt.hash('Viewer@123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@assettrack.com' },
    update: { name: 'Asha Admin', passwordHash: adminHash, role: 'ADMIN', isActive: true, tokenVersion: { increment: 1 } },
    create: { name: 'Asha Admin', email: 'admin@assettrack.com', passwordHash: adminHash, role: 'ADMIN' },
  });
  const viewer = await prisma.user.upsert({
    where: { email: 'viewer@assettrack.com' },
    update: { name: 'Vijay Viewer', passwordHash: viewerHash, role: 'VIEWER', isActive: true, tokenVersion: { increment: 1 } },
    create: { name: 'Vijay Viewer', email: 'viewer@assettrack.com', passwordHash: viewerHash, role: 'VIEWER' },
  });

  const cats = {};
  for (const [name, description] of CATEGORIES) {
    cats[name] = await prisma.category.create({ data: { name, description } });
  }

  const log = (data) => prisma.activityLog.create({ data: { userId: admin.id, ...data } });
  // Activity timestamps: spread over the past so the feed reads naturally.
  const at = (offset, hour = 10) => {
    const d = day(offset);
    d.setUTCHours(hour, 15, 0, 0);
    return d;
  };

  let empIdx = 0;
  const nextEmp = () => EMPLOYEES[empIdx++ % EMPLOYEES.length];
  const serialCount = {};

  for (let i = 0; i < ASSETS.length; i++) {
    const [name, cat, brand, model, prefix, price, vendor, purchaseOff, warrantyOff] = ASSETS[i];
    serialCount[prefix] = (serialCount[prefix] || 0) + 1;
    const serialNumber = `${prefix}-${String(1000 + i * 37).padStart(5, '0')}${serialCount[prefix] > 1 ? `-${serialCount[prefix]}` : ''}`;
    const assetTag = tag(i + 1);
    const purchaseDate = day(purchaseOff);
    const location = cat === 'Furniture' ? LOCATIONS[i % 3] : LOCATIONS[i % LOCATIONS.length];

    const asset = await prisma.asset.create({
      data: {
        assetTag,
        name,
        categoryId: cats[cat].id,
        brand,
        model,
        serialNumber,
        purchaseDate,
        purchasePrice: price,
        vendor,
        warrantyEnd: day(warrantyOff),
        location,
        status: 'IN_STOCK',
        notes: i % 7 === 0 ? 'Asset label applied. Charger included.' : null,
        createdById: admin.id,
        createdAt: at(purchaseOff + 2),
      },
    });
    await log({ action: 'CREATE', entityType: 'Asset', entityId: asset.id, assetId: asset.id, message: `Created ${assetTag} ${name} (${cat})`, createdAt: at(purchaseOff + 2) });

    // Past assignment, returned
    if (PAST_ASSIGN.includes(i)) {
      const [en, ee, dept] = nextEmp();
      const start = purchaseOff + 10;
      const end = Math.min(start + 120, -40);
      const a = await prisma.assignment.create({
        data: { assetId: asset.id, employeeName: en, employeeEmail: ee, department: dept, assignedAt: day(start), conditionNotes: 'Good condition', returnedAt: day(end), returnCondition: i === 6 ? 'Damaged' : 'Good', returnNotes: i === 6 ? 'Several keys sticking' : 'Returned on role change', assignedById: admin.id, returnedById: admin.id },
      });
      await log({ action: 'ASSIGN', entityType: 'Assignment', entityId: a.id, assetId: asset.id, message: `Assigned ${assetTag} to ${en} (${dept})`, createdAt: at(start) });
      await log({ action: 'RETURN', entityType: 'Assignment', entityId: a.id, assetId: asset.id, message: `${en} returned ${assetTag} (condition: ${a.returnCondition})`, createdAt: at(end) });
    }

    // Past repair, completed
    if (PAST_REPAIR[i]) {
      const [issue, rv, cost] = PAST_REPAIR[i];
      const r = await prisma.repair.create({
        data: { assetId: asset.id, issue, vendor: rv, cost, startDate: day(-35), endDate: day(-28), status: 'COMPLETED', createdById: admin.id },
      });
      await log({ action: 'REPAIR_START', entityType: 'Repair', entityId: r.id, assetId: asset.id, message: `Sent ${assetTag} to repair: ${issue} (vendor: ${rv})`, createdAt: at(-35) });
      await log({ action: 'REPAIR_CLOSE', entityType: 'Repair', entityId: r.id, assetId: asset.id, message: `Closed repair for ${assetTag} (cost ${cost.toFixed(2)}); asset back In Stock`, createdAt: at(-28) });
    }

    // Final state
    if (ASSIGNED.includes(i)) {
      const [en, ee, dept] = nextEmp();
      const start = -25 + (i % 20);
      const a = await prisma.assignment.create({
        data: { assetId: asset.id, employeeName: en, employeeEmail: ee, department: dept, assignedAt: day(start), conditionNotes: i % 3 === 0 ? 'Minor scratches on lid' : 'Good condition', assignedById: admin.id },
      });
      await prisma.asset.update({ where: { id: asset.id }, data: { status: 'ASSIGNED' } });
      await log({ action: 'ASSIGN', entityType: 'Assignment', entityId: a.id, assetId: asset.id, message: `Assigned ${assetTag} to ${en} (${dept})`, createdAt: at(start, 11 + (i % 6)) });
    } else if (UNDER_REPAIR[i]) {
      const [issue, rv, cost] = UNDER_REPAIR[i];
      const r = await prisma.repair.create({
        data: { assetId: asset.id, issue, vendor: rv, cost, startDate: day(-6 - (i % 4)), status: i === 19 ? 'IN_PROGRESS' : 'OPEN', createdById: admin.id },
      });
      await prisma.asset.update({ where: { id: asset.id }, data: { status: 'UNDER_REPAIR' } });
      await log({ action: 'REPAIR_START', entityType: 'Repair', entityId: r.id, assetId: asset.id, message: `Sent ${assetTag} to repair: ${issue} (vendor: ${rv})`, createdAt: at(-6 - (i % 4), 14) });
    } else if (RETIRED.includes(i)) {
      await prisma.asset.update({ where: { id: asset.id }, data: { status: 'RETIRED' } });
      await log({ action: 'RETIRE', entityType: 'Asset', entityId: asset.id, assetId: asset.id, message: `Retired ${assetTag}: end of life`, createdAt: at(-15 + i % 5, 16) });
    }
  }

  await prisma.counter.create({ data: { name: 'assetTag', value: ASSETS.length } });

  const counts = await prisma.asset.groupBy({ by: ['status'], _count: { _all: true } });
  console.log(`Users: ${admin.email} (ADMIN), ${viewer.email} (VIEWER)`);
  console.log(`Categories: ${CATEGORIES.length}, Assets: ${ASSETS.length}`);
  console.log('By status:', Object.fromEntries(counts.map((c) => [c.status, c._count._all])));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
