import { Router } from 'express';
import * as gitController from '../controllers/gitController.js';

const router = Router();

// Git API endpoints
router.get('/repo-branches', gitController.getBranches);
router.get('/repo-folders', gitController.getFolders);
router.get('/repo-contents', gitController.getContents);
router.post('/transfer-folder', gitController.transferFolder);

export default router;
