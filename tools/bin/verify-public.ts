import { verifyPublicDirectory } from "../../src/cli/verify-public.ts";
process.exitCode = await verifyPublicDirectory("input");
