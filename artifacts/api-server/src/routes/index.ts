import { Router, type IRouter } from "express";
import healthRouter from "./health";
import leadsRouter from "./leads";
import agentsRouter from "./agents";
import memoryRouter from "./memory";
import proposalsRouter from "./proposals";
import chatRouter from "./chat";
import ideasRouter from "./ideas";
import reportsRouter from "./reports";
import decisionsRouter from "./decisions";
import contextRouter from "./context";
import opportunitiesRouter from "./opportunities";
import planRouter from "./plan";
import morningBriefRouter from "./morningBrief";
import voiceRouter from "./voice";
import homeRouter from "./home";

const router: IRouter = Router();

router.use(healthRouter);
router.use(leadsRouter);
router.use(agentsRouter);
router.use(proposalsRouter);
router.use(memoryRouter);
router.use(chatRouter);
router.use(ideasRouter);
router.use(reportsRouter);
router.use(decisionsRouter);
router.use(contextRouter);
router.use(opportunitiesRouter);
router.use(planRouter);
router.use(morningBriefRouter);
router.use(voiceRouter);
router.use(homeRouter);

export default router;
