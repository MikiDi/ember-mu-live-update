import { isArray } from '@ember/array'
import { later } from '@ember/runloop';
import { inject as service } from '@ember/service';
import fetch from 'fetch'
import { task } from 'ember-concurrency';
import PollUpdateService from './poll-update';
import { alias } from '@ember/object/computed';

export default class LiveUpdateService extends PollUpdateService {
  @service store;
  @service headIdentification;
  @alias('monitoredResources') monitoredSubscriptions;

  /**
   *
   * @method findAll
   * @param {String}	type - Ember data model name
   * @param {Number}	pollInterval - Poll interval in milliseconds
   * @return {Array} Array of ember-data models
   */
  async findAll (type, pollInterval) {
    const subscription = await this.register(this.pollAll, [type], pollInterval);
    return subscription.resource;
  }

  /**
   *
   * @method findRecord
   * @param {String}	type - Ember data model name
   * @param {String}	id
   * @param {Number}	pollInterval - Poll interval in milliseconds
   * @return {Model|null} ember-data model
   */
  async findRecord (type, id, pollInterval) {
    const subscription = await this.register(this.pollRecord, [id, type], pollInterval);
    return subscription.resource;
  }

  /**
   *
   * @method query
   * @param {String}	type - ember-data model name
   * @param {Object}	query optional - Query parameters
   * @param {Number}	pollInterval - Poll interval in milliseconds
   * @return {Array} Array of ember-data models
   */
  async query (type, query, pollInterval) {
    const subscription = await this.register(this.pollQuery, [query, type], pollInterval);
    return subscription.resource;
  }


  async register(pollingFunction, args, pollInterval) {
    const resource = await pollingFunction.apply(this, args);
    const res = await fetch('/subscribe', {
      method: 'POST',
      headers: {
        "Content-type": "application/vnd.api+json; charset=UTF-8",
        'mu-head-id': this.headIdentification.headId
      }
    });
    const sub = await res.json();
    const monitoredSub = {
      id: sub.id,
      pollingFunction,
      args,
      pollInterval,
      resource
    };
    this.monitoredSubscriptions.pushObject(monitoredSub);
    this.lifecycle(monitoredSub);
    return monitoredSub;
  }


  /**
   *
   * @method unregister
   * @param {Model|Array}	resource - The resource(s) you'd like to unregister from live updates
   * @return {Model|Array|null} The resource(s) that successfully got unregistered from live updates
   */
  async unregister (resource) {
    const sub = this.monitoredSubscriptions.findBy('resource', resource) || null;
    if (sub) {
      await fetch(`/subscriptions/${sub.id}`, {
        method: 'DELETE',
        headers: {
          "Content-type": "application/vnd.api+json; charset=UTF-8",
          'mu-head-id': this.headIdentification.headId
        }
      });
      this.monitoredSubscriptions.removeObject(sub);
    }
    return sub;
  }

  lifecycle (subscription) {
    if (this.monitoredSubscriptions.includes(subscription)) {
      this.pollSubscription.perform(subscription);
      const timeout = this.monitoredSubscriptions.pollInterval || this.defaultPollInterval;
      later(this, this.lifecycle, subscription, timeout);
    } // else: Resource got unregistered since last run, don't do anything
  }

  @(task(function * (sub) {
    const res = yield fetch(`/subscriptions/${sub.id}`, {
      method: 'GET',
      headers: {
        "Content-type": "application/vnd.api+json; charset=UTF-8",
        'mu-head-id': this.headIdentification.headId
      }
    });
    if (res.status === 205) {
      const resource = yield sub.pollingFunction.apply(this, sub.args);
      if (isArray(sub.resource)) {
        sub.resource.setObjects(resource);
      } // else: no-op, an update object's properties are already tracked through the data-store
    }
    return sub.resource;
  }).maxConcurrency(1).enqueue()) pollSubscription;
}
