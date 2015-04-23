(function() {
  'use strict';

  angular.module('hz.dashboard.project.instances', [ 'hz.api', 'smart-table', 'MagicSearch' ])

    /**
     * @ngdoc constant
     * @name POWER_STATES
     * @description Instance power state map
     */
    .constant('POWER_STATES',
      {
        0: 'NO STATE',
        1: 'RUNNING',
        2: 'BLOCKED',
        3: 'PAUSED',
        4: 'SHUTDOWN',
        5: 'SHUTOFF',
        6: 'CRASHED',
        7: 'SUSPENDED',
        8: 'FAILED',
        9: 'BUILDING'
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
          $scope.floatingLabel = gettext('Floating IPs:');
        }]
      };
    }])

    /**
     * @ngdoc controller
     * @name hz.dashboard.project.instances.controller:instancesCtrl
     * @description Controller for the instances table
     *
     */
    .controller('instancesCtrl', [ 'hzUtils', 'POWER_STATES', 'novaAPI',
      function(hzUtils, POWER_STATES, novaAPI) {
        var ctrl = this;

        ctrl.headers = {
          name: gettext('Instance Name'),
          image: gettext('Image Name'),
          ip: gettext('IP Address'),
          size: gettext('Size'),
          keyPair: gettext('Key Pair'),
          status: gettext('Status'),
          az: gettext('Availability Zone'),
          task: gettext('Task'),
          powerState: gettext('Power State'),
          created: gettext('Created')
        };

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
            name: 'name',
            label: gettext('Name')
          },
          {
            name: 'status',
            label: gettext('Status'),
            options: [
              { key: 'active', label: gettext('Active') },
              { key: 'shutoff', label: gettext('Shutoff') },
              { key: 'suspended', label: gettext('Suspended') },
              { key: 'paused', label: gettext('Paused') },
              { key: 'error', label: gettext('Error') }
            ]
          }
        ];

        ctrl.update = function(params) {
          // If params is empty, grab query from URL
          if (!params) {
            var url = window.location.href;
            if (url.indexOf('?') > -1) {
              var query = url.split('?')[1];
              params = hzUtils.deserialize(query);
            }
          }

          if (params && params.name) {
            params.name = params.name + '*';
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

                instance.task_state = instance['OS-EXT-STS:task_state'] || gettext('None');
                instance.power_state = instance['OS-EXT-STS:power_state'];
                delete instance['OS-EXT-STS:task_state'];
                delete instance['OS-EXT-STS:power_state'];

                return instance;
              });
            });
        };

        ctrl.update();
      }
    ]);

}());