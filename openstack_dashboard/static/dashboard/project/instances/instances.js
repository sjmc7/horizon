(function() {
  'use strict';

  angular.module('hz.dashboard.project.instances', [ 'hz.api', 'smart-table', 'MagicSearch', 'angularMoment' ])

    /**
     * @ngdoc constant
     * @name POWER_STATES
     * @description Instance power state map
     */
    .constant('POWER_STATES',
      {
        0: gettext('NO STATE'),
        1: gettext('RUNNING'),
        2: gettext('BLOCKED'),
        3: gettext('PAUSED'),
        4: gettext('SHUTDOWN'),
        5: gettext('SHUTOFF'),
        6: gettext('CRASHED'),
        7: gettext('SUSPENDED'),
        8: gettext('FAILED'),
        9: gettext('BUILDING')
      }
    )

    /**
     * @ngdoc directive
     * @name hz.dashboard.project.instances.directive:ipAddress
     * @element
     * @description Display IP addresses
     *
     * @restrict E
     * @example
     * ```
     * ctrl.networks = [
     *   {
     *     name: 'myNet',
     *     fixed: [ '127.0.0.1', '127.0.0.2' ],
     *     floating: [ '127.0.0.3', '127.0.0.4' ]
     *   }
     * ];
     *
     * <ip-address networks="networks"></ip-address>
     * ```
     */
    .directive('ipAddress', [ 'dashboardBasePath', function(path) {
      return {
        restrict: 'E',
        scope: {
          networks: '='
        },
        templateUrl: path + 'project/instances/ip_address.html',
        controller: [ '$scope', function($scope) {
          $scope.floatingLabel = gettext('Floating IPs');
        }]
      };
    }])

    /**
     * @ngdoc controller
     * @name hz.dashboard.project.instances.controller:instancesCtrl
     * @description Controller for the instances table
     *
     */
    .controller('instancesCtrl',
      [ '$scope', '$timeout', 'hzUtils', 'POWER_STATES', 'novaAPI', 'simpleModalService',
      function($scope, $timeout, hzUtils, POWER_STATES, novaAPI, modal) {
        var ctrl = this;

        ctrl.powerStateMap = POWER_STATES;

        ctrl.instances = [];
        ctrl.displayedInstances = [];

        ctrl.filterStrings = {
          cancel: gettext('Cancel'),
          prompt: gettext('Click here for menu to filter instances'),
          remove: gettext('Remove'),
          text: gettext('In filtered instances')
        };

        ctrl.facets = [
          {
            name: 'flavor',
            label: gettext('Flavor')
          },
          {
            name: 'host',
            label: gettext('Host')
          },
          {
            name: 'ipv4',
            label: gettext('IPv4 Address'),
            singleton: true
          },
          {
            name: 'ipv6',
            label: gettext('IPv6 Address'),
            singleton: true
          },
          {
            name: 'name',
            label: gettext('Name'),
            singleton: true
          },
          {
            name: 'project_id',
            label: gettext('Project'),
            singleton: true
          },
          {
            name: 'status',
            label: gettext('Status'),
            options: [
              { key: 'active', label: gettext('Active') },
              { key: 'shutoff', label: gettext('Shutoff') },
              { key: 'suspended', label: gettext('Suspended') },
              { key: 'paused', label: gettext('Paused') },
              { key: 'error', label: gettext('Error') },
              { key: 'rescue', label: gettext('Rescue') },
              { key: 'shelved', label: gettext('Shelved') },
              { key: 'shelved_offloaded', label: gettext('Shelved Offloaded') }
            ]
          }
        ];

        ctrl.terminateInstances = function(selected) {
          var serverIds = [], instanceNameList = [];
          angular.forEach(selected, function(selection, id) {
            if (selection.checked) {
              serverIds.push(id);
              instanceNameList.push(selection.item.name);
            }
          });

          var instanceNames = instanceNameList.join(', ');
          var msg = gettext('You have selected %s. Please confirm your selection. Terminated instances are not recoverable.');
          var options = {
            title: gettext('Confirm Terminate Instances'),
            body: interpolate(msg, [ instanceNames ])
          };

          modal(options).result.then(function() {
            novaAPI.deleteServers(serverIds)
              .then(function() {
                var successMsg = gettext('Deleted %s');
                horizon.alert('success', interpolate(successMsg, [ instanceNames ]));

                ctrl.update();
              });
          });
        };

        ctrl.update = function(params) {
          if (angular.isDefined(ctrl.updateTimer)) {
            $timeout.cancel(ctrl.updateTimer);
          }

          // If params is empty, grab query from URL
          if (!angular.isDefined(params) || !angular.isObject(params)) {
            var url = window.location.href;
            if (url.indexOf('?') > -1) {
              var query = url.split('?')[1];
              params = hzUtils.deserialize(query);
            }
          }

          novaAPI.getServers(params)
            .then(function(response) {
              ctrl.instances = response.data.map(function(instance) {
                var addresses = [],
                  input = instance.addresses,
                  networks = Object.keys(input);

                angular.forEach(networks, function(name) {
                  var network = { name: name, fixed: [], floating: [] };

                  input[name].reduce(function(prev, curr) {
                    prev[curr['OS-EXT-IPS:type']].push(curr.addr);
                    return prev;
                  }, network);

                  addresses.push(network);
                });
                instance.ipAddresses = addresses;

                if (addresses.length) {
                  var firstAddress = addresses[0];
                  instance.ip = firstAddress.fixed.length ?
                                firstAddress.fixed[0] :
                                firstAddress.floating[0];
                }

                instance.detailLink = '/project/instances/' + instance.id + '/';
                instance.imageName = instance.image.name;
                instance.flavorName = instance.full_flavor.name;

                instance.task_state = instance['OS-EXT-STS:task_state'] || gettext('None');
                instance.power_state = instance['OS-EXT-STS:power_state'];
                delete instance['OS-EXT-STS:task_state'];
                delete instance['OS-EXT-STS:power_state'];

                return instance;
              });

              ctrl.updateTimer = $timeout(ctrl.update, 8000, false);
            });
        };

        ctrl.updateFacets = function() {
          novaAPI.getFacets()
            .catch(function(err) {
              // do nothing for now
            })
            .then(function(response) {
              ctrl.facets = response.data;
              $scope.$broadcast('facetsChanged');

              // TODO: Translation???
            });
        };

        ctrl.updateFacets();
        ctrl.update();
      }
    ]);

}());