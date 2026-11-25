import { checkArmor } from "../../src/cli/signature-armor.ts";
process.exitCode = await checkArmor(process.argv.slice(2));
