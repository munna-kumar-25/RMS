import { Router } from 'express';
import { requireAuthentication } from '../../middlewares/auth.middleware.js';
import { requireCsrf } from '../auth/csrf.js';
import { assignRestaurantBranches, createRestaurant, deleteRestaurant, listRestaurants, updateRestaurant } from './restaurant.controller.js';

const router = Router();
router.use(requireAuthentication);
router.get('/', listRestaurants);
router.post('/', requireCsrf, createRestaurant);
router.patch('/:restaurantId', requireCsrf, updateRestaurant);
router.post('/:restaurantId/branches', requireCsrf, assignRestaurantBranches);
router.delete('/:restaurantId', requireCsrf, deleteRestaurant);

export default router;
