import { faker } from "@faker-js/faker";
import type { UserCreateInput } from "./user.zod.js";

export const userCreateFixture = (input: Partial<UserCreateInput> = {}) => ({
  email: faker.internet.email(),
  name: faker.person.fullName(),
  image: faker.image.avatar(),
  ...input
})