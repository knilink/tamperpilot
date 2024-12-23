module.exports = function (fileInfo, api, options) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  return post_cleanup(j, root, '__name_$_eman__').toSource();
};

function skip_name_mapping(path) {
  const parentNode = path.parent.node;
  let res = null;
  if (parentNode.type === 'MemberExpression' && parentNode.property === path.node && !parentNode.computed) {
    res = path.node.name;
  }
  // Handle object property definitions (e.g., { member: value })
  if (parentNode.type === 'Property' || parentNode.type === 'MethodDefinition')
    if (parentNode.key === path.node && !parentNode.computed) {
      res = path.node.name;
    }

  // Handle object destructuring (e.g., const { member } = obj)
  // if (parentNode.type === 'ObjectPattern' && parentNode.properties.some(prop => prop.key === path.node && !prop.computed)) {
  //   return true;
  // }

  return !!res;
}

function post_cleanup(j, root, name_label_generated_name) {
  let recheck = true;

  root
    .find(j.UnaryExpression, { operator: 'void', argument: { type: 'Literal' } })
    .replaceWith(j.identifier('undefined'));
  root.find(j.UnaryExpression, { operator: '!', argument: { type: 'Literal', value: 0 } }).replaceWith(j.literal(true));
  root
    .find(j.UnaryExpression, { operator: '!', argument: { type: 'Literal', value: 1 } })
    .replaceWith(j.literal(false));

  // (_a=a)!=null||(a=v) => a??=v
  root
    .find(j.LogicalExpression, {
      operator: '||',
      left: { operator: '!=', left: { type: 'AssignmentExpression' }, right: { value: null } },
      right: { type: 'AssignmentExpression' },
    })
    .replaceWith((path) => {
      if (path.node.left.left.right.name !== path.node.right.left.name) {
        return path.node;
      }
      return j.assignmentExpression('??=', path.node.right.left, path.node.right.right);
    });

  // a != null ? a : b;
  root
    .find(j.ConditionalExpression, {
      test: { operator: '!=', left: { type: 'Identifier' }, right: { type: 'Literal', value: null } },
    })
    .replaceWith((path) => {
      const node = path.node;
      if (node.consequent?.name === node.test.left.name) {
        return j.logicalExpression('??', node.test.left, node.alternate);
      }
      return node;
    });

  // (_a=b)!=null?_a:c => b??c
  root
    .find(j.ConditionalExpression, {
      test: { left: { type: 'AssignmentExpression' } },
      consequent: { type: 'Identifier' },
    })
    .replaceWith((path) => {
      if (path.node.test.left.left.name !== path.node.consequent.name) return path.node;
      const left = path.node.test.left.right;
      const right = path.node.alternate;
      left.extra = { parenthesized: true, parenStart: 0 };
      right.extra = { parenthesized: true, parenStart: 0 };
      return j.logicalExpression('??', left, right);
    });

  // a && a.b, a!=null && a.b => a?.b
  // (_a = b.c)!=null && _a.d => b.c?.d
  root
    .find(j.LogicalExpression, (node) => {
      if (node.left.type === 'Identifier') return true;
      if (
        node.left.type === 'BinaryExpression' &&
        node.left.operator == '!=' &&
        node.left.right.type === 'Literal' &&
        node.left.right.value === null
      )
        return true;
      return false;
    })
    .replaceWith((path) => {
      let updated = false;
      const name = path.node.left.name || path.node.left.left.name || path.node.left.left.left.name;
      const expr = path.node.left.left?.right || path.node.left.left || path.node.left;

      j(path.node)
        .find(j.MemberExpression, {
          object: { type: 'Identifier', name },
        })
        .replaceWith((inner_path) => {
          let _p = inner_path.parent;
          let _q = inner_path;
          // preventing a&&bar(a.b), a&&(b=a), a&&(a.b(),c())
          while (_p.node !== path.node) {
            if (_p.node.type === 'CallExpression' && _p.node.callee !== _q.node) {
              return inner_path.node;
            }
            if (_p.node.type === 'AssignmentExpression' || _p.node.type === 'SequenceExpression') {
              return inner_path.node;
            }
            _q = _p;
            _p = _p.parent;
          }

          updated = true;
          // inner_path.node.optional = true;
          // return j.chainExpression(expr);
          return j.optionalMemberExpression(expr, inner_path.node.property, inner_path.node.computed, true);
        });

      return updated ? path.node.right : path.node;
    });

  // a==null?undefined:a.b
  // (_b = lastTurn.agent) == null ? undefined : _b.agentSlug
  root
    .find(j.ConditionalExpression, {
      test: { type: 'BinaryExpression', operator: '==', right: { type: 'Literal', value: null } },
      consequent: { type: 'Identifier', name: 'undefined' },
    })
    .replaceWith((path) => {
      let updated = false;

      if (path.node.test.left.type === 'Identifier') {
        j(path.node)
          .find(j.MemberExpression, {
            object: { type: 'Identifier', name: path.node.test.left.name },
          })
          .replaceWith((inner_path) => {
            updated = true;
            inner_path.node.optional = true;
            return j.chainExpression(inner_path.node);
          });
      } else if (path.node.test.left.type == 'AssignmentExpression') {
        const temp_var_name = path.node.test.left.left.name;
        const expr = path.node.test.left.right;
        j(path.node)
          .find(j.MemberExpression, {
            object: { type: 'Identifier', name: temp_var_name },
          })
          .replaceWith((inner_path) => {
            updated = true;
            return j.optionalMemberExpression(expr, inner_path.node.property, inner_path.node.computed, true);
          });
      }

      return updated ? path.node.alternate : path.node;
    });

  root.find(j.VariableDeclaration).forEach((path) => {
    const parent = path.parent;
    if (
      path.node.declarations.length > 1 &&
      (parent.node.type === 'BlockStatement' || parent.node.type === 'Program')
    ) {
      parent.node.body = parent.node.body.flatMap((body_item_node) => {
        if (body_item_node !== path.node) return [body_item_node];
        return path.node.declarations.map((exp) => j.variableDeclaration(path.node.kind, [exp]));
      });
    }
  });

  // __name(.., .. )
  name_label_generated_name &&
    root.find(j.CallExpression, { callee: { name: name_label_generated_name } }).replaceWith((path) => {
      if (
        skip_name_mapping(path) ||
        path.node.arguments.length !== 2 ||
        path.node.arguments[1].type !== 'Literal' ||
        typeof path.node.arguments[1].value !== 'string'
      )
        return path.node;
      if (
        path.node.arguments[0].type === 'Identifier' &&
        path.parent.node.type === 'ExpressionStatement' &&
        ['BlockStatement', 'Program'].includes(path.parent.parent.node.type)
      ) {
        return j.emptyStatement();
      }
      return path.node.arguments[0];
    });

  while (recheck) {
    recheck = false;

    root.find(j.LogicalExpression).forEach((path) => {
      const parent = path.parent;
      const grant_parent = parent.parent;
      if (
        parent.node.type === 'ExpressionStatement' &&
        (grant_parent.node.type === 'BlockStatement' || grant_parent.node.type === 'Program')
      ) {
        grant_parent.node.body = grant_parent.node.body.map((body_item_node) => {
          if (body_item_node !== parent.node) return body_item_node;
          // a&&b=1 => if(a){b=1}
          if (path.node.operator === '&&') {
            recheck = true;
            return j.ifStatement(path.node.left, j.blockStatement([j.expressionStatement(path.node.right)]));
          }
          // a||b=1 => if(!a){b=1}
          if (path.node.operator === '||') {
            recheck = true;
            return j.ifStatement(
              j.unaryExpression('!', path.node.left),
              j.blockStatement([j.expressionStatement(path.node.right)])
            );
          }
          return body_item_node;
        });
      }
    });

    // if(a) (b=1,c=2)=>if(a) {(b=1,c=2)}
    root
      .find(
        j.IfStatement,
        (node) =>
          (node.consequent && node.consequent.type !== 'BlockStatement') ||
          (node.alternate && node.alternate.type !== 'BlockStatement' && node.alternate.type !== 'IfStatement')
      )
      .forEach((path) => {
        const node = path.node;
        if (node.consequent && node.consequent.type !== 'Blockstatement') {
          recheck = true;
          node.consequent = j.blockStatement([node.consequent]);
        }
        if (node.alternate && node.alternate.type !== 'BlockStatement' && node.alternate.type !== 'IfStatement') {
          recheck = true;
          node.alternate = j.blockStatement([node.alternate]);
        }
      });

    const updateLoopBody = (path) => {
      const node = path.node;
      if (node.body.type !== 'BlockStatement') {
        recheck = true;
        node.body = j.blockStatement([node.body]);
      }
    };
    // for(...) (b=1,c=2)=>for(...) {(b=1,c=2)}
    root.find(j.ForStatement).forEach(updateLoopBody);
    // while(...) (b=1,c=2)=>for(...) {(b=1,c=2)}
    root.find(j.WhileStatement).forEach(updateLoopBody);

    root.find(j.SequenceExpression).forEach((path) => {
      const parent = path.parent;
      const grant_parent = parent.parent;
      if (
        grant_parent.node.type === 'BlockStatement' ||
        grant_parent.node.type === 'Program' ||
        grant_parent.node.type === 'SwitchCase'
      ) {
        const body = grant_parent.node.type === 'SwitchCase' ? 'consequent' : 'body';
        // (a=1,b=2) => a=1;b=2
        if (parent.node.type === 'ExpressionStatement') {
          grant_parent.node[body] = grant_parent.node[body].flatMap((body_item_node) => {
            if (body_item_node !== parent.node) return [body_item_node];
            recheck = true;
            return path.node.expressions.map((exp) => j.expressionStatement(exp));
          });
        }
        // if((a=1,b=2,c)){} => a=1;b=2;if(c){}
        else if (parent.node.type === 'IfStatement') {
          grant_parent.node[body] = grant_parent.node[body].flatMap((body_item_node) => {
            if (body_item_node !== parent.node) return [body_item_node];
            body_item_node.test = path.node.expressions.slice(-1)[0];
            recheck = true;
            return [...path.node.expressions.slice(0, -1).map(j.expressionStatement), body_item_node];
          });
        }
        // return a=1,b=2,c; => a=1;b=2;return c
        else if (parent.node.type === 'ReturnStatement') {
          grant_parent.node[body] = grant_parent.node[body].flatMap((body_item_node) => {
            if (body_item_node !== parent.node) return [body_item_node];
            body_item_node.argument = path.node.expressions.slice(-1)[0];
            recheck = true;
            return [...path.node.expressions.slice(0, -1).map((exp) => j.expressionStatement(exp)), body_item_node];
          });
        }
        // throw (a=1,b=2,c) => a=1;b=2;throw c
        else if (parent.node.type === 'ThrowStatement') {
          grant_parent.node[body] = grant_parent.node[body].flatMap((body_item_node) => {
            if (body_item_node !== parent.node) return [body_item_node];
            body_item_node.argument = path.node.expressions.slice(-1)[0];
            recheck = true;
            return [...path.node.expressions.slice(0, -1).map((exp) => j.expressionStatement(exp)), body_item_node];
          });
        }
      }

      // if(a) (b=1,c=2)=>if(a) {b=1;c=2}
      // for(...) (b=1,c=2)=>for(...) {b=1;c=2}
      // if (
      //   parent.node.type === 'ExpressionStatement' &&
      //   (['IfStatement', 'WhileStatement'].includes(grant_parent.node.type) ||
      //     /^For.*Statement$/.test(grant_parent.node.type))
      // ) {
      //   const block_statement = j.blockStatement(path.node.expressions.map(j.expressionStatement));
      //   if (grant_parent.node.consequent === parent.node) {
      //     grant_parent.node.consequent = block_statement;
      //     recheck = true;
      //   } else if (grant_parent.node.alternate === parent.node) {
      //     grant_parent.node.alternate = block_statement;
      //     recheck = true;
      //   } else if (grant_parent.node.body === parent.node) {
      //     grant_parent.node.body = block_statement;
      //     recheck = true;
      //   }
      // }

      // if (parent.node.type === 'ExpressionStatement' && grant_parent.node.type === 'IfStatement') {
      //   const block_statement = j.blockStatement(path.node.expressions.map(j.expressionStatement));
      //   if (grant_parent.node.consequent === parent.node) {
      //     grant_parent.node.consequent = block_statement;
      //     recheck = true;
      //   } else if (grant_parent.node.alternate === parent.node) {
      //     grant_parent.node.alternate = block_statement;
      //     recheck = true;
      //   }
      // }
    });

    // FROM: a?b=1:c=2
    // TO: if(b){b=1}else{c=22}
    root.find(j.ConditionalExpression).forEach((path) => {
      const parent = path.parent;
      const grant_parent = parent.parent;
      if (
        parent.node.type === 'ExpressionStatement' &&
        (grant_parent.node.type === 'BlockStatement' || grant_parent.node.type === 'Program')
      ) {
        grant_parent.node.body = grant_parent.node.body.map((body_item_node) => {
          if (body_item_node !== parent.node) return body_item_node;
          recheck = true;
          return j.ifStatement(
            path.node.test,
            j.blockStatement([j.expressionStatement(path.node.consequent)]),
            j.blockStatement([j.expressionStatement(path.node.alternate)])
          );
        });
      }
    });
  }

  root
    .find(j.Property, {
      kind: 'init',
      computed: false,
      shorthand: false,
      key: { type: 'Identifier' },
      value: { type: 'Identifier' },
    })
    .forEach(({ node }) => {
      if (node.value.name === node.key.name) {
        node.extra ??= {};
        node.extra.shorthand = true;
        node.shorthand = true;
      }
    });

  return root;
}
