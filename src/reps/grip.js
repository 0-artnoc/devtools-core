// ReactJS
const React = require("react");
// Dependencies
const {
  isGrip,
  safeObjectLink,
  wrapRender,
} = require("./rep-utils");
const Caption = require("./caption");
const PropRep = require("./prop-rep");
const { MODE } = require("./constants");
// Shortcuts
const { span } = React.DOM;

/**
 * Renders generic grip. Grip is client representation
 * of remote JS object and is used as an input object
 * for this rep component.
 */
GripRep.propTypes = {
  object: React.PropTypes.object.isRequired,
  // @TODO Change this to Object.values once it's supported in Node's version of V8
  mode: React.PropTypes.oneOf(Object.keys(MODE).map(key => MODE[key])),
  isInterestingProp: React.PropTypes.func,
  title: React.PropTypes.string,
  objectLink: React.PropTypes.func,
  attachedActorIds: React.PropTypes.array,
  onDOMNodeMouseOver: React.PropTypes.func,
  onDOMNodeMouseOut: React.PropTypes.func,
  onInspectIconClick: React.PropTypes.func,
};

function GripRep(props) {
  let object = props.object;
  let propsArray = safePropIterator(props, object,
    (props.mode === MODE.LONG) ? 10 : 3);

  if (props.mode === MODE.TINY) {
    return (
      span({className: "objectBox objectBox-object"},
        getTitle(props, object)
      )
    );
  }

  return (
    span({className: "objectBox objectBox-object"},
      getTitle(props, object),
      safeObjectLink(props, {
        className: "objectLeftBrace",
      }, " { "),
      ...propsArray,
      safeObjectLink(props, {
        className: "objectRightBrace",
      }, " }")
    )
  );
}

function getTitle(props, object) {
  let title = props.title || object.class || "Object";
  return safeObjectLink(props, {}, title);
}

function safePropIterator(props, object, max) {
  max = (typeof max === "undefined") ? 3 : max;
  try {
    return propIterator(props, object, max);
  } catch (err) {
    console.error(err);
  }
  return [];
}

function propIterator(props, object, max) {
  if (object.preview && Object.keys(object.preview).includes("wrappedValue")) {
    const { Rep } = require("./rep");

    return [Rep({
      object: object.preview.wrappedValue,
      mode: props.mode || MODE.TINY,
      defaultRep: Grip,
    })];
  }

  // Property filter. Show only interesting properties to the user.
  let isInterestingProp = props.isInterestingProp || ((type, value) => {
    return (
      type == "boolean" ||
      type == "number" ||
      (type == "string" && value.length != 0)
    );
  });

  let properties = object.preview
    ? object.preview.ownProperties
    : {};
  let propertiesLength = object.preview && object.preview.ownPropertiesLength
    ? object.preview.ownPropertiesLength
    : object.ownPropertyLength;

  if (object.preview && object.preview.safeGetterValues) {
    properties = Object.assign({}, properties, object.preview.safeGetterValues);
    propertiesLength += Object.keys(object.preview.safeGetterValues).length;
  }

  let indexes = getPropIndexes(properties, max, isInterestingProp);
  if (indexes.length < max && indexes.length < propertiesLength) {
    // There are not enough props yet. Then add uninteresting props to display them.
    indexes = indexes.concat(
      getPropIndexes(properties, max - indexes.length, (t, value, name) => {
        return !isInterestingProp(t, value, name);
      })
    );
  }

  const truncate = Object.keys(properties).length > max;
  // The server synthesizes some property names for a Proxy, like
  // <target> and <handler>; we don't want to quote these because,
  // as synthetic properties, they appear more natural when
  // unquoted.
  const suppressQuotes = object.class === "Proxy";
  let propsArray = getProps(props, properties, indexes, truncate, suppressQuotes);
  if (truncate) {
    // There are some undisplayed props. Then display "more...".
    propsArray.push(Caption({
      object: safeObjectLink(props, {}, `${propertiesLength - max} more…`)
    }));
  }

  return propsArray;
}

/**
 * Get props ordered by index.
 *
 * @param {Object} componentProps Grip Component props.
 * @param {Object} properties Properties of the object the Grip describes.
 * @param {Array} indexes Indexes of properties.
 * @param {Boolean} truncate true if the grip will be truncated.
 * @param {Boolean} suppressQuotes true if we should suppress quotes
 *                  on property names.
 * @return {Array} Props.
 */
function getProps(componentProps, properties, indexes, truncate, suppressQuotes) {
  let propsArray = [];

  // Make indexes ordered by ascending.
  indexes.sort(function (a, b) {
    return a - b;
  });

  indexes.forEach((i) => {
    let name = Object.keys(properties)[i];
    let value = getPropValue(properties[name]);

    let propRepProps = Object.assign({}, componentProps, {
      mode: MODE.TINY,
      name: name,
      object: value,
      equal: ": ",
      delim: i !== indexes.length - 1 || truncate ? ", " : "",
      defaultRep: Grip,
      // Do not propagate title to properties reps
      title: undefined,
      suppressQuotes,
    });
    delete propRepProps.objectLink;
    propsArray.push(PropRep(propRepProps));
  });

  return propsArray;
}

/**
 * Get the indexes of props in the object.
 *
 * @param {Object} properties Props object.
 * @param {Number} max The maximum length of indexes array.
 * @param {Function} filter Filter the props you want.
 * @return {Array} Indexes of interesting props in the object.
 */
function getPropIndexes(properties, max, filter) {
  let indexes = [];

  try {
    let i = 0;
    for (let name in properties) {
      if (indexes.length >= max) {
        return indexes;
      }

      // Type is specified in grip's "class" field and for primitive
      // values use typeof.
      let value = getPropValue(properties[name]);
      let type = (value.class || typeof value);
      type = type.toLowerCase();

      if (filter(type, value, name)) {
        indexes.push(i);
      }
      i++;
    }
  } catch (err) {
    console.error(err);
  }
  return indexes;
}

/**
 * Get the actual value of a property.
 *
 * @param {Object} property
 * @return {Object} Value of the property.
 */
function getPropValue(property) {
  let value = property;
  if (typeof property === "object") {
    let keys = Object.keys(property);
    if (keys.includes("value")) {
      value = property.value;
    } else if (keys.includes("getterValue")) {
      value = property.getterValue;
    }
  }
  return value;
}

// Registration
function supportsObject(object, type) {
  if (!isGrip(object)) {
    return false;
  }
  return (object.preview && object.preview.ownProperties);
}

// Grip is used in propIterator and has to be defined here.
let Grip = {
  rep: wrapRender(GripRep),
  supportsObject,
};

// Exports from this module
module.exports = Grip;
