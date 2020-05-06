import Service from '@ember/service';
import { getOwner } from '@ember/application';
import { tracked } from '@glimmer/tracking';
import { v4 as uuidv4 } from 'uuid';

export default class UpdateSubscriptionService extends Service {

  @tracked headIdKey;

  constructor () {
    super(...arguments);
    const config = getOwner(this).resolveRegistration('config:environment');
    this.headIdKey = `${config.modulePrefix}-mu-head-id`;
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
