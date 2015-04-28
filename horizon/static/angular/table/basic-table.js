(function() {
  'use strict';

  angular.module('hz.widget.table')

    .constant('FILTER_PLACEHOLDER_TEXT', gettext('Filter'))

    /**
     * @ngdoc directive
     * @name hz.widget.table.directive:searchBar
     * @element
     * @param {string} {array} groupClasses Input group classes (optional)
     * @param {string} {array} iconClasses Icon classes (optional)
     * @param {string} {array} inputClasses Search field classes (optional)
     * @param {string} placeholder input field placeholder text (optional)
     * @description
     * The `searchBar` directive generates a search field that will
     * trigger filtering of the associated Smart-Table.
     *
     * groupClasses - classes that should be applied to input group element
     * iconClasses - classes that should be applied to search icon
     * inputClasses - classes that should be applied to search input field
     * placeholder - text that will be used for a placeholder attribute
     *
     * @restrict E
     *
     * @example
     * ```
     * <search-bar group-classes="input-group-sm"
     *   icon-classes="fa-search" input-classes="..." placeholder="Filter">
     * </search-bar>
     * ```
     */
    .directive('searchBar', [ 'FILTER_PLACEHOLDER_TEXT', 'basePath',
      function(FILTER_PLACEHOLDER_TEXT, path) {
      return {
        restrict: 'E',
        templateUrl: path + 'table/search-bar.html',
        transclude: true,
        link: function (scope, element, attrs, ctrl, transclude) {
          if (angular.isDefined(attrs.groupClasses)) {
            element.find('.input-group').addClass(attrs.groupClasses);
          }
          if (angular.isDefined(attrs.iconClasses)) {
            element.find('.fa').addClass(attrs.iconClasses);
          }
          var searchInput = element.find('[st-search]');

          if (angular.isDefined(attrs.inputClasses)) {
            searchInput.addClass(attrs.inputClasses);
          }
          var placeholderText = attrs.placeholder || FILTER_PLACEHOLDER_TEXT;
          searchInput.attr('placeholder', placeholderText);

          transclude(scope, function(clone){
            element.find('.input-group').append(clone);
          });
        }
      };
    }])

    /**
     * @ngdoc directive
     * @name hz.widget.table.directive:magicStSearch
     * @element
     * @description
     * A directive to make Magic Search a replacement for st-search.
     * This directive must wrap a magic-search directive and be inside
     * a SmartTable.
     *
     * @restrict E
     * @scope
     *
     * @example
     * ```
     * <magic-st-search>
     *   <magic-search
     *     template="/static/angular/magic-search/magic-search.html"
     *     strings="filterStrings"
     *     facets="{$ filterFacets $}">
     *   </magic-search>
     * </magic-st-search>
     * ```
     */
    .directive('magicStSearch', [ '$window', '$timeout', 'hzUtils',
      function($window, $timeout, hzUtils) {
      return {
        restrict: 'E',
        require: '^stTable',
        scope: true,
        link: function(scope, element, attr, tableCtrl) {

          // Callback function to update table
          var update = angular.isDefined(attr.update) ? scope[attr.update] : undefined;

          function updateInstances(query, params) {
            var url = window.location.href;
            if (url.indexOf('?') > -1) {
              url = url.split('?')[0];
            }
            if (query && query.length > 0) {
              url = url + '?' + query;
            }
            window.history.pushState(query, '', url);

            if (angular.isDefined(update)) {
              update(params);
            }
          }

          scope.$on('textRemoved', function() {
            var url = $window.location.href;
            if (url.indexOf('?') > -1) {
              var params = hzUtils.deserialize(url.split('?')[1]);
              if (angular.isDefined(params.free)) {
                delete params.free;
              }
              var query = hzUtils.serialize(params);

              updateInstances(query, params);
            }
          });

          scope.$on('textSearch', function(event, text, filterKeys) {
            var searchValue = $('.search-input').val();
            if (searchValue === '') {
              var query, params;
              var url = $window.location.href;
              if (url.indexOf('?') > -1) {
                params = hzUtils.deserialize(url.split('?')[1]);
                if (text !== '') {
                  params.free = text;
                } else if (angular.isDefined(params.free)) {
                  // delete params.free;
                }
                query = hzUtils.serialize(params);
              } else if (text !== '') {
                query = 'free=' + text;
                params = { free: text };
              }

              updateInstances(query, params);
            }
          });

          // When user changes a facet, use API filter
          scope.$on('searchUpdated', function(event, query) {
            var url = $window.location.href;
            if (url.indexOf('?') > -1) {
              var params = hzUtils.deserialize(url.split('?')[1]);
              if (angular.isDefined(params.free)) {
                query += '&free=' + params.free;
              }
            }

            updateInstances(query, hzUtils.deserialize(query));
          });
        }
      };
    }])

    /**
     * @ngdoc directive
     * @name hz.widget.table.directive:magicSearchBar
     * @element
     * @param {function} filterCallback Function to update table using query
     * @param {object} filterFacets Facets allowed for searching
     * @param {object} filterStrings Help content shown in search bar
     * @description
     * The `magicSearchBar` directive provides a template for a
     * client side faceted search that utilizes Smart-Table's
     * filtering capabilities as well.
     *
     * Controller definition:
     * ```
     * var nameFacet = {
     *   label: gettext('Name'),
     *   name: 'name',
     *   singleton: true
     * };
     *
     * var sizeFacet = {
     *   label: gettext('Size'),
     *   name: 'size',
     *   singleton: false,
     *   options: [
     *     { label: gettext('Small'), key: 'small' },
     *     { label: gettext('Medium'), key: 'medium' },
     *     { label: gettext('Large'), key: 'large' },
     *   ]
     * };
     *
     * label - this is the text shown in top level facet dropdown menu
     * name - this is the column key provided to Smart-Table
     * singleton - 'true' if free text can be used as search term
     * options - list of options shown in selected facet dropdown menu
     *
     * ctrl.items = [];
     *
     * ctrl.filterFacets = [ nameFacet, sizeFacet ];
     *
     * ctrl.filterStrings = {
     *   cancel: gettext('Cancel'),
     *   prompt: gettext('Click here for menu to filter rows'),
     *   remove: gettext('Remove'),
     *   text: gettext('In filtered rows')
     * };
     *
     * ctrl.updateTable = function(query) {
     *   // update the table using the query
     *   items = getItems(query);
     * };
     * ```
     *
     * @restrict E
     * @scope
     *
     * @example
     * ```
     * <div ng-controller="MyCtrl as ctrl">
     *   <magic-search-bar
     *     filter-callback="ctrl.updateTable"
     *     filter-facets="ctrl.filterFacets"
     *     filter-strings="ctrl.filterStrings">
     *     </magic-search-bar>
     * </div>
     * ```
     */
    .directive('magicSearchBar', [ 'basePath', function(path) {
      return {
        restrict: 'E',
        scope: {
          filterCallback: '=',
          filterStrings: '=',
          filterFacets: '='
        },
        transclude: true,
        templateUrl: path + 'table/magic-search-bar.html',
        link: function(scope, element, attrs, ctrl, transclude) {
          element.find('ng-transclude').children().first().unwrap();
        }
      };
    }]);

}());