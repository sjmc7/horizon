(function() {
  'use strict';

  angular.module('hz.dashboard.project.instances', [ 'hz.api', 'smart-table', 'MagicSearch' ])

    /**
     * @ngdoc controller
     * @name hz.dashboard.project.instances.controller:instancesCtrl
     * @description Controller for the instances table
     *
     */
    .controller('instancesCtrl', [ 'hzUtils', 'novaAPI', function(hzUtils, novaAPI) {
      var ctrl = this;

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
            ctrl.instances = response.data;
          });
      };

      ctrl.update();

    }]);

}());