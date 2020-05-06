import Service from '@ember/service';
import { v4 as uuidv4 } from 'uuid';

export default class headIdentificationService extends Service {

  headIdKey = 'mu-head-id';

  constructor () {
    super(...arguments);
    if (!this.headId) {
      this.headId = uuidv4();
    }
  }

  get headId () {
    return sessionStorage.getItem(this.headIdKey);
  }

  set headId (value) {
    return sessionStorage.setItem(this.headIdKey, value);
  }

}
