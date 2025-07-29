/** @jsx jsx */
import React, { useState, useEffect, useRef } from 'react';
import { jsx } from 'jimu-core';
import { AllWidgetProps } from 'jimu-core';
import { JimuMapView, JimuMapViewComponent } from 'jimu-arcgis';
import { Radio, Button, Select, Option, TextInput, Checkbox } from 'jimu-ui';
import GraphicsLayer from 'esri/layers/GraphicsLayer';
import SketchViewModel from 'esri/widgets/Sketch/SketchViewModel';
import SimpleMarkerSymbol from 'esri/symbols/SimpleMarkerSymbol';
import SimpleLineSymbol from 'esri/symbols/SimpleLineSymbol';
import SimpleFillSymbol from 'esri/symbols/SimpleFillSymbol';
import Graphic from 'esri/Graphic';
import geometryEngine from 'esri/geometry/geometryEngine';
import Query from 'esri/rest/support/Query';
import FeatureLayer from 'esri/layers/FeatureLayer'; // ✅ FIX: Use FeatureLayer instead of QueryTask

const Widget = (props: AllWidgetProps<unknown>) => {
  const [jimuMapView, setJimuMapView] = useState<JimuMapView>(null);
  const [sketchViewModel, setSketchViewModel] = useState<SketchViewModel>(null);
  const [graphicsLayer, setGraphicsLayer] = useState<GraphicsLayer>(null);
  const [geometryType, setGeometryType] = useState<'point' | 'polyline' | 'polygon'>('point');
  const [bufferDistance, setBufferDistance] = useState(100);
  const [bufferUnit, setBufferUnit] = useState<'meters' | 'kilometers' | 'feet' | 'miles'>('meters');
  const [bufferGraphic, setBufferGraphic] = useState<Graphic>(null);
  const [availableLayers, setAvailableLayers] = useState<Array<{ id: string; title: string; url: string }>>([]);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [showLayerSelection, setShowLayerSelection] = useState<boolean>(false);

  const bufferDistanceRef = useRef(bufferDistance);
  const bufferUnitRef = useRef(bufferUnit);

  useEffect(() => {
    bufferDistanceRef.current = bufferDistance;
  }, [bufferDistance]);

  useEffect(() => {
    bufferUnitRef.current = bufferUnit;
  }, [bufferUnit]);

  useEffect(() => {
    if (jimuMapView && jimuMapView.view) {
      const layer = new GraphicsLayer();
      jimuMapView.view.map.add(layer);
      setGraphicsLayer(layer);

      const sketchVM = new SketchViewModel({
        view: jimuMapView.view,
        layer,
        pointSymbol: new SimpleMarkerSymbol({ style: 'circle', color: [226, 119, 40], size: '12px' }),
        polylineSymbol: new SimpleLineSymbol({ color: [226, 119, 40], width: 2 }),
        polygonSymbol: new SimpleFillSymbol({
          color: [226, 119, 40, 0.4],
          outline: new SimpleLineSymbol({ color: [226, 119, 40], width: 1 }),
        }),
      });

      sketchVM.on('create', (event) => {
        if (event.state === 'complete') {
          const currentBufferDistance = bufferDistanceRef.current;
          const currentBufferUnit = bufferUnitRef.current;

          const buffer = geometryEngine.buffer(event.graphic.geometry, currentBufferDistance, currentBufferUnit);
          if (buffer) {
            const newBufferGraphic = new Graphic({
              geometry: buffer,
              symbol: new SimpleFillSymbol({
                color: [0, 0, 255, 0.2],
                outline: new SimpleLineSymbol({ color: [0, 0, 255], width: 1 }),
              }),
            });
            layer.add(newBufferGraphic);
            setBufferGraphic(newBufferGraphic);
            layer.remove(event.graphic);
          }
          jimuMapView.view.cursor = 'default';
        }
      });

      setSketchViewModel(sketchVM);

      const layers = jimuMapView.view.map.allLayers.toArray()
        .filter(layer => layer.type === 'feature' && layer.url)
        .map(layer => ({
          id: layer.id,
          title: layer.title || layer.id,
          url: layer.url
        }));

      setAvailableLayers(layers);
      setSelectedLayerIds(layers.map(layer => layer.id));

      return () => {
        if (sketchVM) sketchVM.destroy();
        if (layer) jimuMapView.view.map.remove(layer);
      };
    }
  }, [jimuMapView]);

  const handleDrawClick = () => {
    if (sketchViewModel) {
      if (graphicsLayer && bufferGraphic) {
        graphicsLayer.remove(bufferGraphic);
        setBufferGraphic(null);
      }
      sketchViewModel.create(geometryType);
      jimuMapView.view.cursor = 'crosshair';
    }
  };

  const handleClear = () => {
    if (graphicsLayer) {
      graphicsLayer.removeAll();
      setBufferGraphic(null);
    }
  };

  const handleToggleLayerSelection = () => {
    setShowLayerSelection(!showLayerSelection);
  };

  const handleLayerCheckboxChange = (layerId: string) => {
    setSelectedLayerIds(prevSelected => {
      if (prevSelected.includes(layerId)) {
        return prevSelected.filter(id => id !== layerId);
      } else {
        return [...prevSelected, layerId];
      }
    });
  };

  const handleSave = async () => {
    if (!bufferGraphic) {
      alert('No buffer created.');
      return;
    }

    const bufferGeom = bufferGraphic.geometry;
    let allRows: string[][] = [];
    allRows.push(['Layer', 'FeatureID', 'Attribute', 'Value']);

    for (const layerId of selectedLayerIds) {
      const layerInfo = availableLayers.find(layer => layer.id === layerId);
      if (!layerInfo) continue;

      const query = new Query({
        geometry: bufferGeom,
        spatialRelationship: 'intersects',
        outFields: ['*'],
        returnGeometry: false
      });

      try {
        const featureLayer = new FeatureLayer({ url: layerInfo.url });
        const results = await featureLayer.queryFeatures(query);

        for (const feature of results.features) {
          const attributes = feature.attributes;
          const featureId = attributes['OBJECTID'] || '';
          for (const [key, value] of Object.entries(attributes)) {
            allRows.push([layerInfo.title, featureId.toString(), key, value?.toString() ?? '']);
          }
        }
      } catch (err) {
        console.error(`Query failed for layer ${layerInfo.title}:`, err);
      }
    }

    if (allRows.length === 1) {
      alert('No intersecting features found in selected layers.');
      return;
    }

    const csvContent = allRows.map(row =>
      row.map(val => `"${val.replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'buffer_report.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  
  return (
    <div
      className="widget-container"
      style={{
        padding: '1rem',
        borderRadius: '10px',
        backdropFilter: 'blur(10px)',
        backgroundColor: 'rgba(255, 255, 255, 0.6)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
        width: '300px',
      }}
    >
      {!jimuMapView && <div>Please connect this widget to a map using the setting panel.</div>}

      {jimuMapView && (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <strong>Select Geometry Type:</strong>
            <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
              <label>
                <Radio name="geometry" checked={geometryType === 'point'} onChange={() => setGeometryType('point')} />
                Point
              </label>
              <label>
                <Radio name="geometry" checked={geometryType === 'polyline'} onChange={() => setGeometryType('polyline')} />
                Polyline
              </label>
              <label>
                <Radio name="geometry" checked={geometryType === 'polygon'} onChange={() => setGeometryType('polygon')} />
                Polygon
              </label>
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <strong>Buffer Distance:</strong>
            <TextInput
              type="number"
              value={bufferDistance.toString()}
              onChange={(e) => setBufferDistance(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <strong>Buffer Unit:</strong>
            <Select value={bufferUnit} onChange={(e) => setBufferUnit(e.target.value as any)} style={{ width: '100%' }}>
              <Option value="meters">Meters</Option>
              <Option value="kilometers">Kilometers</Option>
              <Option value="feet">Feet</Option>
              <Option value="miles">Miles</Option>
            </Select>
          </div>

          <Button type="primary" onClick={handleDrawClick} style={{ width: '100%', marginBottom: '0.5rem' }}>
            Start Drawing
          </Button>

          <Button onClick={handleToggleLayerSelection} style={{ width: '100%', marginBottom: '0.5rem' }}>
            {showLayerSelection ? 'Hide Layer Selection' : 'Select Layers for Report'}
          </Button>

          {showLayerSelection && (
            <div style={{
              border: '1px solid #ccc',
              borderRadius: '5px',
              padding: '0.5rem',
              marginBottom: '1rem',
              maxHeight: '150px',
              overflowY: 'auto',
              backgroundColor: 'rgba(255, 255, 255, 0.8)'
            }}>
              <strong>Select Layers:</strong>
              {availableLayers.length > 0 ? (
                availableLayers.map(layer => (
                  <div key={layer.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '0.2rem' }}>
                    <Checkbox
                      checked={selectedLayerIds.includes(layer.id)}
                      onChange={() => handleLayerCheckboxChange(layer.id)}
                      style={{ marginRight: '0.5rem' }}
                    />
                    <span>{layer.title}</span>
                  </div>
                ))
              ) : (
                <p>No queryable layers found in the map.</p>
              )}
            </div>
          )}

          <Button onClick={handleSave} style={{ width: '100%', marginBottom: '0.5rem' }}>
            Export CSV
          </Button>
          <Button type="danger" onClick={handleClear} style={{ width: '100%' }}>
            Clear All
          </Button>
        </>
      )}

      <JimuMapViewComponent
        useMapWidgetId={props.useMapWidgetIds?.[0]}
        onActiveViewChange={(view) => {
          if (view) setJimuMapView(view);
        }}
      />
    </div>
  );
};

export default Widget;
