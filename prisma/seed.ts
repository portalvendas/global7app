import { PrismaClient, CompanyType, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Cria a empresa OPERATOR (Global 7) e o primeiro admin, se ainda não existirem.
 * Idempotente: pode rodar várias vezes.
 */
async function main() {
  const email = (process.env.ADMIN_EMAIL || '[email protected]').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe@123';

  let operator = await prisma.company.findFirst({ where: { type: CompanyType.OPERATOR } });
  if (!operator) {
    operator = await prisma.company.create({
      data: { type: CompanyType.OPERATOR, name: 'Global 7' },
    });
    console.log('Criada empresa OPERATOR:', operator.id);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    const user = await prisma.user.create({
      data: {
        companyId: operator.id,
        role: UserRole.GLOBAL7_ADMIN,
        name: 'Admin Global 7',
        email,
        password: await bcrypt.hash(password, 10),
      },
    });
    console.log('Criado admin:', user.email);
  } else {
    console.log('Admin já existe:', existing.email);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
