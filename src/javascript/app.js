Ext.define("PortfolioAlignment", {
    extend: 'Rally.app.TimeboxScopedApp',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),

    /**
     * TimeboxScopedApp settings
     */
    scopeType: 'release',
    comboboxConfig: {
        fieldLabel: 'Release',
        labelAlign: 'right',
        width: 300,
        margin: 10
    },

    defaults: { margin: 10 },
    portfolioItemFetchFields: ['Name','ObjectID','FormattedID','AcceptedLeafStoryPlanEstimateTotal','LeafStoryPlanEstimateTotal','PreliminaryEstimate','Value'],
    plannedField: 'LeafStoryPlanEstimateTotal',
    actualField: 'AcceptedLeafStoryPlanEstimateTotal',
    noneText: 'None',
    otherText: 'Other',
    config: {
        targetField: 'InvestmentCategory'
    },

    items: [
        {xtype: 'container', itemId: 'ct-header',cls: 'header', layout: {type: 'hbox'}},
        {xtype:'container',itemId:'ct-target'},
        {xtype:'container',itemId:'ct-display', layout:{type: 'hbox'}},
        {xtype:'tsinfolink'}
    ],

    onNoAvailableTimeboxes: function(){
        this.logger.log('No available releases');
    },
    onScopeChange: function(scope){
        this.logger.log('scope changed',scope);
        this._updateApp();
    },
    initComponent: function() {
         this.callParent([]);
    },
    launch: function(){
        this.callParent();

        this.cbPortfolioItemType = this.getHeader().add({
            xtype: 'rallyportfolioitemtypecombobox',
            itemId: 'type-combo',
            fieldLabel: 'PortfolioItem Type',
            labelWidth: 100,
            labelAlign: 'right',
            margin: 10,
            listeners: {
                scope: this,
                ready: this._updatePortfolioItemConfig,
                change: this._updatePortfolioItemConfig
            }
        });

        this.getHeader().add({
            xtype: 'rallybutton',
            text: 'Targets...',
            scope: this,
            margin: 10,
            handler: this._buildTargetDialog
        });
    },
    _configureTargets: function(){

    },
    _updatePortfolioItemConfig: function(cb){
        var workspaceRef = this.getContext().getWorkspace()._ref;
        var targetField = this.targetField;
        this.portfolioItemType = cb.getRecord().get('TypePath');

        this.logger.log('_loadCategories', this.portfolioItemType, targetField);

        Rally.data.wsapi.ModelFactory.getModel({
            type: this.portfolioItemType,
            context: {
                workspace: workspaceRef
            },
            scope: this,
            success: function(model) {
                var field = model.getField(targetField);
                field.getAllowedValueStore().load({
                    fetch: ['StringValue'],
                    callback: function(allowedValues, operation, success){
                        if (success){
                            var values = _.map(allowedValues, function(av){return av.get('StringValue')});
                            this.targetFieldValues = values;
                            this._updateApp();
                        } else {
                            var msg = 'Error retrieving allowed values for ' + targetField + ': ' + operation.error.errors[0];
                            Rally.ui.notify.Notifier.showError({message: msg});
                        }
                    },
                    scope: this
                });
            }
        });
    },
    _updateApp: function() {
        var piTypeRecord = this.portfolioItemType,
            timebox = null,
            targetField = this.targetField,
            allowedValues = this._getTargetFieldValues();

        if (this.getContext().getTimeboxScope()){
            timebox = this.getContext().getTimeboxScope().getRecord();
        }

        this.logger.log('_updateDisplay PortfolioItem Type, Timebox, categories', piTypeRecord, timebox, allowedValues);

        if (piTypeRecord && timebox && allowedValues) {
            this.down('#ct-display').removeAll();  //cleanup

            this.down('#ct-display').add({
                xtype: 'rallychart',
                width: '25%',
                loadMask: false,
                chartData: {
                    series: this._getTargetChartData()
                },
                chartConfig: this._getChartConfig("Target")
            });

            this._fetchData(piTypeRecord, timebox).then({
                scope: this,
                success: function(data){
                    if (data && data.length > 0){

                        this.down('#ct-display').add({
                            xtype: 'rallychart',
                            width: '25%',
                            loadMask: false,
                            chartData: {
                                series: this._getChartData(data,'PreliminaryEstimate','Planned',"Value")
                            },
                            chartConfig: this._getChartConfig("Planned")
                        });

                        this.down('#ct-display').add({
                            xtype: 'rallychart',
                            width: '25%',
                            loadMask: false,
                            chartData: {
                                series: this._getChartData(data,this.plannedField,'Scheduled')
                            },
                            chartConfig: this._getChartConfig("Scheduled")
                        });

                        this.down('#ct-display').add({
                            xtype: 'rallychart',
                            width: '25%',
                            loadMask: false,
                            chartData: {
                                series: this._getChartData(data, this.actualField, 'Actual')
                            },
                            chartConfig: this._getChartConfig("Actual")
                        });
                    } else {
                        //TODO:  Add text to indicate that no data was found for the current settings
                    }

                },
                failure: function(operation){
                    Rally.ui.notify.Notifier.showError({message: 'Error fetching portfolio items'});
                }
            });
        }
        return;
    },
    _getTargetAllocationHash: function(){
        var targetAllocationHash = this.targetAllocationHash || {};
        this.logger.log('_getTargetAllocationHash', targetAllocationHash);

        if (_.isEmpty(targetAllocationHash)){
            //TODO: load from preferences .
            var targetFieldValues = this._getTargetFieldValues();

            var numValidTargetValues = _.without(targetFieldValues,"").length;
            var defaultTargetAllocation = numValidTargetValues > 0 ? 100 / numValidTargetValues : 100;
            Ext.each(targetFieldValues, function(f){
                if (f && f.length > 0){
                    targetAllocationHash[f] = defaultTargetAllocation;
                }
            });
            this.logger.log('_getTargetAllocationHash updated', targetAllocationHash);
            this._setTargetAllocationHash(targetAllocationHash);
        }
        return targetAllocationHash;
    },
    _setTargetAllocationHash: function(hash){
        this.targetAllocationHash = hash;
        //TODO: save to preferences
    },
    _getTargetAllocation: function(targetValue){

        this.logger.log('_getTargetAllocation',targetValue, this._getTargetAllocationHash());
        if (targetValue && targetValue.length > 0){
            return this._getTargetAllocationHash()[targetValue];
        }
        return 0;
    },
    _addPlannedChart: function(data){
        this.down('#ct-display').add({
            xtype: 'rallychart',
            chartData: this._getChartData(data, this.plannedField, 'Planned'),
            chartConfig: this._getChartConfig("Planned")
        });
    },
    _initCategoryDataHash: function(){
        var category_data = {},
            allowedValues = this._getTargetFieldValues();

        Ext.each(allowedValues, function(a){
            if (a && a.length > 0){
                category_data[a] = 0;
            }
        });
        category_data[this.noneText] = 0;
        category_data[this.otherText] = 0;
        return category_data;
    },
    _getChartData: function(data, dataField, seriesName, optionalDataFieldAttribute){
        var category_data = this._initCategoryDataHash(),
            allowedValues = this._getTargetFieldValues(),
            targetField = this.targetField,
            noneText = this.noneText,
            otherText = this.otherText;

        Ext.each(data, function(rec){


            var categoryVal = rec.get(targetField) || noneText,
                dataVal = rec.get(dataField) || 0;

            if (dataVal && optionalDataFieldAttribute){
                dataVal = dataVal[optionalDataFieldAttribute] || 0;
            }

            if (_.has(category_data, categoryVal)){
                category_data[categoryVal] += dataVal;
            } else {
                category_data[otherText] += dataVal;
            }
        });

        var series_data = _.map(category_data, function(value, category){
            return {name: category, y: value};  //, color: this._getColor(colorIndexes[category])});
        });

        this.logger.log('_getChartData', seriesName, category_data, series_data);
        return [{
                type: 'pie',
                name: seriesName,
                data:  series_data
        }];

    },
    _addActualChart: function(data){
        this.down('#ct-display').add({
            xtype: 'rallychart',
            chartData: this._getChartData(data, this.actualField, 'Actual'),
            chartConfig: this._getChartConfig("Actual")
        });
    },
    _fetchData: function(portfolioItemType, release){
        var deferred = Ext.create('Deft.Deferred'),
            fetch = this.portfolioItemFetchFields,
            context = {workspace: this.getContext().getWorkspace()._ref,
                        project: this.getContext().getProjectRef(),
                        projectScopeUp: this.getContext().getProjectScopeUp(),
                        projectScopeDown: this.getContext().getProjectScopeDown()
            };

        fetch.push(this.targetField);
        var store = Ext.create('Rally.data.wsapi.Store',{
            model: portfolioItemType,
            fetch: fetch,
            context: context,
            filters: [{
                property: 'Release.Name',
                value: release.get('Name')
            },{
                property: 'Release.ReleaseStartDate',
                value: release.get('ReleaseStartDate')
            },{
                property: 'Release.ReleaseDate',
                value: release.get('ReleaseDate')
            }]
        });
        store.load({
            callback: function(records, operation, success){
                this.logger.log('Portfolio item data load ',success, records,operation);
                if (success){
                    deferred.resolve(records);
                } else {
                    deferred.reject(operation);
                }
            },
            scope: this
        });
        return deferred;
    },
    _getTargetChartData: function(){
        var categories = this._getTargetFieldValues();
        var series_data = [];

        Ext.each(categories, function(c){
            if (c && c.length > 0){
                var val = this._getTargetAllocation(c);
                series_data.push({name: c, y: val}); //, color: this._getColor(colorIndexes[key])});
//                series_data.push([c,1]);
            };
        }, this);

        return [{
                type: 'pie',
                name: 'Target',
                data: series_data
            }];
    },
    _getChartConfig: function(title){
        return {
            chart: {
                plotBackgroundColor: null,
                    plotBorderWidth: null,
                    plotShadow: false
            },
            title: {
                text: title
            },
            tooltip: {
                pointFormat: '{point.y:.1f} (<b>{point.percentage:.1f}%</b>)'
            },
            plotOptions: {
                pie: {
                    allowPointSelect: true,
                        cursor: 'pointer',
                        dataLabels: {
                        enabled: false
                    },
                    showInLegend: true
                }
            },
            legend: {
                symbolHeight: 8,
                symbolWidth: 8,
                padding: 4,
                borderColor: null,
                itemStyle: {"fontSize": "9px"}
            }
        };
    },
    _getTargetFieldValues: function(){
        if (this.targetFieldValues && this.targetFieldValues.length > 0){
            return this.targetFieldValues;
        }
        return null;
    },
    _buildTargetDialog: function(){
        Ext.create('Rally.technicalservices.dialog.TargetAllocation', {
            targetAllocation: this._getTargetAllocationHash(),
            listeners: {
                scope: this,
                allocationsupdate: this._updateTargetAllocations
            }
         });
    },
    _updateTargetAllocations: function(updatedHash){
        this.logger.log('_updateTargetAllocations', updatedHash);
        this._setTargetAllocationHash(updatedHash);
        this._updateApp();
    }
});