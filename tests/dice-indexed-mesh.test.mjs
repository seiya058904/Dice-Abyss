import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {indexedRoundedCubeMesh,roundedCubeMesh} from '../src/dice-renderer.js';

const bytes=values=>new Uint8Array(values.buffer,values.byteOffset,values.byteLength);
const expand=({vertices,indices})=>{
  const mesh=new Float32Array(indices.length*9);
  for(let i=0;i<indices.length;i++)mesh.set(vertices.subarray(indices[i]*9,indices[i]*9+9),i*9);
  return mesh;
};

test('indexed default dice preserve the immutable V5.12 mesh bit for bit',()=>{
  const expected='98e13b7cf19cf2842fe8cd6a617214af143a26deaebff22a5fedee2d6d1d8516';
  const mesh=indexedRoundedCubeMesh(),expanded=expand(mesh);
  assert.equal(createHash('sha256').update(bytes(expanded)).digest('hex'),expected,
    'Every original float, signed zero, face number and triangle winding remains in order');
  assert.deepEqual(bytes(expanded),bytes(roundedCubeMesh()));
  assert.equal(mesh.vertices.length/9,1014);
  assert.equal(mesh.indices.length,5184);
  assert.equal(mesh.vertices.byteLength+mesh.indices.byteLength,46872);
  assert.equal(expanded.byteLength,186624);
});

test('all positions, normals, UVs and face IDs survive compact indexing across mesh sizes',()=>{
  for(const steps of [1,2,4,8,12,24])for(const radius of [.001,.075,.125,.25,.5]){
    const mesh=indexedRoundedCubeMesh(steps,radius);
    assert.deepEqual(bytes(expand(mesh)),bytes(roundedCubeMesh(steps,radius)),`steps=${steps}, radius=${radius}`);
    const verticesPerFace=(steps+1)**2,indicesPerFace=steps*steps*6;
    for(let face=0;face<6;face++){
      const indices=mesh.indices.subarray(face*indicesPerFace,(face+1)*indicesPerFace);
      assert.equal(new Set(indices).size,verticesPerFace,'Every vertex is used by its own complete face');
      for(const index of indices){
        assert.equal(Math.floor(index/verticesPerFace),face,'UV/face seams are not welded across faces');
        assert.equal(mesh.vertices[index*9+8],face);
      }
    }
  }
});

test('WebGL 1 index type stays unsigned-short without requiring an extension',()=>{
  const mesh=indexedRoundedCubeMesh(103);
  assert(mesh.indices instanceof Uint16Array);
  assert.equal(mesh.vertices.length/9,64896);
  assert.equal(Math.max(...mesh.indices.subarray(-103*103*6)),64895);
  for(const invalid of [0,-1,1.5,104,Infinity,NaN]){
    assert.throws(()=>indexedRoundedCubeMesh(invalid),RangeError,'Invalid grids fail before allocation or 16-bit wrapping');
  }
});
