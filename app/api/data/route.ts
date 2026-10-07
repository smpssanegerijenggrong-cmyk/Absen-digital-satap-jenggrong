import {isOperator} from '../../../lib/auth';
import {getDb} from '../../../db';
import {createDataHandlers} from '../../../lib/data-handlers';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const {GET,POST}=createDataHandlers({authorize:isOperator,database:getDb});
